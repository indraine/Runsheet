import { TRACE_CHANNELS, type TraceChannel } from "~/domain/trace"
import type { EncodedTrace, RunsheetDump } from "~/db/transfer"

/**
 * Binary dump: `RSHT`, a version byte, then a gzip stream of
 *
 * - `u32` length of the header and the header itself (JSON without traces),
 * - `u32` trace count, and per trace its lap id, sample count and the
 *   channels one after another.
 *
 * A channel is stored as whole numbers (the value times a per-channel scale,
 * rounded), as the difference from the previous sample, zigzag-folded and
 * written as a varint. Smooth channels turn into runs of tiny numbers that
 * gzip squeezes well.
 */
export const BINARY_MAGIC = "RSHT"
export const BINARY_VERSION = 1

/** Steps kept per channel: the value is rounded to `1 / scale`. */
export const CHANNEL_SCALE: Record<TraceChannel, number> = {
    distance: 100,
    time: 1,
    speed: 100,
    throttle: 1000,
    brake: 1000,
    steer: 10_000,
    gear: 1,
    gLong: 1000,
    gLat: 1000,
    x: 100,
    z: 100,
    pressureFl: 100,
    pressureFr: 100,
    pressureRl: 100,
    pressureRr: 100,
    brakeTempFl: 10,
    brakeTempFr: 10,
    rpm: 1,
    heading: 10_000,
}

const HEAD_LEN = BINARY_MAGIC.length + 1

export const isBinaryDump = (bytes: Uint8Array): boolean =>
    bytes.length >= HEAD_LEN &&
    BINARY_MAGIC.split("").every(
        (char, index) => bytes[index] === char.charCodeAt(0)
    )

class ByteWriter {
    private bytes = new Uint8Array(1 << 16)
    private length = 0

    private reserve(extra: number): void {
        if (this.length + extra <= this.bytes.length) return
        let size = this.bytes.length
        while (size < this.length + extra) size *= 2
        const next = new Uint8Array(size)
        next.set(this.bytes.subarray(0, this.length))
        this.bytes = next
    }

    byte(value: number): void {
        this.reserve(1)
        this.bytes[this.length++] = value
    }

    u32(value: number): void {
        this.reserve(4)
        new DataView(this.bytes.buffer).setUint32(this.length, value, true)
        this.length += 4
    }

    raw(chunk: Uint8Array): void {
        this.reserve(chunk.length)
        this.bytes.set(chunk, this.length)
        this.length += chunk.length
    }

    /** Signed whole number as a zigzag varint; arithmetic keeps large values exact. */
    signed(value: number): void {
        let rest = value >= 0 ? value * 2 : -value * 2 - 1
        this.reserve(10)
        while (rest >= 128) {
            this.bytes[this.length++] = (rest % 128) + 128
            rest = Math.floor(rest / 128)
        }
        this.bytes[this.length++] = rest
    }

    done(): Uint8Array {
        return this.bytes.subarray(0, this.length)
    }
}

class ByteReader {
    private offset = 0
    private readonly view: DataView

    constructor(private readonly bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    }

    byte(): number {
        const value = this.bytes[this.offset++]
        if (value === undefined) throw new Error("Файл обрезан")
        return value
    }

    u32(): number {
        if (this.offset + 4 > this.bytes.length) throw new Error("Файл обрезан")
        const value = this.view.getUint32(this.offset, true)
        this.offset += 4
        return value
    }

    raw(length: number): Uint8Array {
        if (this.offset + length > this.bytes.length) {
            throw new Error("Файл обрезан")
        }
        const chunk = this.bytes.subarray(this.offset, this.offset + length)
        this.offset += length
        return chunk
    }

    signed(): number {
        let rest = 0
        let factor = 1
        for (;;) {
            const next = this.byte()
            rest += (next % 128) * factor
            if (next < 128) break
            factor *= 128
        }
        return rest % 2 === 0 ? rest / 2 : -(rest + 1) / 2
    }
}

const gzip = (
    bytes: Uint8Array,
    stream: CompressionStream | DecompressionStream
) =>
    new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
        .arrayBuffer()
        .then(buffer => new Uint8Array(buffer))

export async function encodeBinaryDump(
    dump: RunsheetDump
): Promise<Uint8Array> {
    const { traces, ...header } = dump
    const body = new ByteWriter()
    const head = new TextEncoder().encode(JSON.stringify(header))
    body.u32(head.length)
    body.raw(head)
    body.u32(traces.length)
    for (const trace of traces) writeTrace(body, trace)

    const packed = await gzip(body.done(), new CompressionStream("gzip"))
    const out = new Uint8Array(HEAD_LEN + packed.length)
    out.set(new TextEncoder().encode(BINARY_MAGIC))
    out[BINARY_MAGIC.length] = BINARY_VERSION
    out.set(packed, HEAD_LEN)
    return out
}

export async function decodeBinaryDump(
    bytes: Uint8Array
): Promise<RunsheetDump> {
    if (!isBinaryDump(bytes))
        throw new Error("Файл не является снимком Runsheet")
    const version = bytes[BINARY_MAGIC.length]
    if (version !== BINARY_VERSION) {
        throw new Error(`Неподдерживаемая версия файла: ${String(version)}`)
    }
    let unpacked: Uint8Array
    try {
        unpacked = await gzip(
            bytes.subarray(HEAD_LEN),
            new DecompressionStream("gzip")
        )
    } catch {
        throw new Error("Файл повреждён")
    }
    const reader = new ByteReader(unpacked)
    const header = JSON.parse(
        new TextDecoder().decode(reader.raw(reader.u32()))
    ) as Omit<RunsheetDump, "traces">
    const count = reader.u32()
    const traces: EncodedTrace[] = []
    for (let index = 0; index < count; index += 1) {
        traces.push(readTrace(reader))
    }
    return { ...header, traces }
}

function writeTrace(out: ByteWriter, trace: EncodedTrace): void {
    const id = new TextEncoder().encode(trace.lapId)
    const samples = trace.distance.length
    out.byte(id.length)
    out.raw(id)
    out.u32(samples)
    for (const channel of TRACE_CHANNELS) {
        const scale = CHANNEL_SCALE[channel]
        const values = trace[channel]
        let previous = 0
        for (let index = 0; index < samples; index += 1) {
            const value = values[index]
            const whole = Math.round(
                (Number.isFinite(value) ? (value as number) : 0) * scale
            )
            out.signed(whole - previous)
            previous = whole
        }
    }
}

function readTrace(input: ByteReader): EncodedTrace {
    const lapId = new TextDecoder().decode(input.raw(input.byte()))
    const samples = input.u32()
    const trace = { lapId } as EncodedTrace
    for (const channel of TRACE_CHANNELS) {
        const scale = CHANNEL_SCALE[channel]
        const values = new Array<number>(samples)
        let whole = 0
        for (let index = 0; index < samples; index += 1) {
            whole += input.signed()
            values[index] = whole / scale
        }
        trace[channel] = values
    }
    return trace
}
