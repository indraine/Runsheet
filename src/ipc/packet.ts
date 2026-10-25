import { TRACE_CHANNELS, realTimeMs, type Lap, type Trace } from "~/domain"

const HEADER_LEN = 76
const MISSING_MS = -1
const MISSING_M = -1

const OFF_NUMBER = 32
const OFF_COUNT = 36
const OFF_TIME = 40
const OFF_S1 = 44
const OFF_S2 = 48
const OFF_S3 = 52
const OFF_S1_END = 56
const OFF_S2_END = 60
const OFF_VALID = 64
const OFF_FUEL = 68
const OFF_MAX_SPEED = 72

export type DecodedLap = {
    lap: Lap
    trace: Trace
}

export const encodeLapPacket = (lap: Lap, trace: Trace): ArrayBuffer => {
    const count = trace.distance.length
    for (const channel of TRACE_CHANNELS) {
        if (trace[channel].length !== count) {
            throw new Error(
                `Канал ${channel} длиной ${trace[channel].length}, ожидалось ${count}`
            )
        }
    }
    if (trace.lapId !== lap.id) {
        throw new Error(`Трейс ${trace.lapId} не совпадает с кругом ${lap.id}`)
    }

    const buffer = new ArrayBuffer(
        HEADER_LEN + count * TRACE_CHANNELS.length * 4
    )
    const view = new DataView(buffer)
    writeUuid(view, 0, lap.id)
    writeUuid(view, 16, lap.sessionId)
    view.setInt32(OFF_NUMBER, lap.number, true)
    view.setUint32(OFF_COUNT, count, true)
    view.setInt32(OFF_TIME, lap.timeMs ?? MISSING_MS, true)
    view.setInt32(OFF_S1, lap.s1Ms ?? MISSING_MS, true)
    view.setInt32(OFF_S2, lap.s2Ms ?? MISSING_MS, true)
    view.setInt32(OFF_S3, lap.s3Ms ?? MISSING_MS, true)
    view.setFloat32(OFF_S1_END, lap.s1EndM ?? MISSING_M, true)
    view.setFloat32(OFF_S2_END, lap.s2EndM ?? MISSING_M, true)
    view.setUint8(OFF_VALID, lap.valid ? 1 : 0)
    view.setFloat32(OFF_FUEL, lap.fuel, true)
    view.setFloat32(OFF_MAX_SPEED, lap.maxSpeed, true)
    writePlane(view, trace, count)
    return buffer
}


export const decodeLapPacket = (
    buffer: ArrayBuffer
): DecodedLap | undefined => {
    if (buffer.byteLength < HEADER_LEN) return undefined
    const view = new DataView(buffer)
    const count = view.getUint32(OFF_COUNT, true)
    const expected = HEADER_LEN + count * TRACE_CHANNELS.length * 4
    if (buffer.byteLength !== expected) return undefined

    const lapId = readUuid(view, 0)
    const lap: Lap = {
        id: lapId,
        sessionId: readUuid(view, 16),
        number: view.getInt32(OFF_NUMBER, true),
        timeMs: realTimeMs(view.getInt32(OFF_TIME, true)),
        s1Ms: realTimeMs(view.getInt32(OFF_S1, true)),
        s2Ms: realTimeMs(view.getInt32(OFF_S2, true)),
        s3Ms: realTimeMs(view.getInt32(OFF_S3, true)),
        s1EndM: optionalM(view.getFloat32(OFF_S1_END, true)),
        s2EndM: optionalM(view.getFloat32(OFF_S2_END, true)),
        valid: view.getUint8(OFF_VALID) !== 0,
        fuel: view.getFloat32(OFF_FUEL, true),
        maxSpeed: view.getFloat32(OFF_MAX_SPEED, true),
    }

    return { lap, trace: readPlane(view, lapId, count) }
}

const writePlane = (view: DataView, trace: Trace, count: number): void => {
    let offset = HEADER_LEN
    for (const channel of TRACE_CHANNELS) {
        const samples = trace[channel]
        for (let index = 0; index < count; index += 1) {
            view.setFloat32(offset, samples[index] ?? 0, true)
            offset += 4
        }
    }
}

const readPlane = (view: DataView, lapId: string, count: number): Trace => {
    const trace = { lapId } as Trace
    let offset = HEADER_LEN
    for (const channel of TRACE_CHANNELS) {
        trace[channel] = readChannel(view, offset, count)
        offset += count * 4
    }
    return trace
}

const readChannel = (
    view: DataView,
    offset: number,
    count: number
): Float32Array => {
    const samples = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
        samples[index] = view.getFloat32(offset + index * 4, true)
    }
    return samples
}

const optionalM = (value: number): number | null =>
    value === MISSING_M ? null : value

const readUuid = (view: DataView, offset: number): string => {
    let hex = ""
    for (let index = 0; index < 16; index += 1) {
        hex += view
            .getUint8(offset + index)
            .toString(16)
            .padStart(2, "0")
    }
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const writeUuid = (view: DataView, offset: number, id: string): void => {
    const hex = id.replace(/-/g, "")
    if (hex.length !== 32 || /[^0-9a-fA-F]/.test(hex)) {
        throw new Error(`Не uuid: ${id}`)
    }
    for (let index = 0; index < 16; index += 1) {
        view.setUint8(
            offset + index,
            Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
        )
    }
}
