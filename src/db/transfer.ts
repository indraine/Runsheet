import { invoke, isTauri } from "@tauri-apps/api/core"
import {
    decodeBinaryDump,
    encodeBinaryDump,
    isBinaryDump,
} from "~/db/binary-dump"
import {
    isReference,
    isSessionType,
    TRACE_CHANNELS,
    type Lap,
    type Session,
    type SessionStatus,
    type Trace,
    type TraceChannel,
} from "~/domain"
import { DB_VERSION, type RunsheetDatabase } from "~/db/schema"

export const DUMP_FORMAT = "runsheet.dump" as const
export const DUMP_VERSION = 1 as const

export type RunsheetDump = {
    format: typeof DUMP_FORMAT
    version: typeof DUMP_VERSION
    dbVersion: number
    exportedAt: number
    sessions: Session[]
    laps: Lap[]
    traces: EncodedTrace[]
}

export type EncodedTrace = { lapId: string } & Record<TraceChannel, number[]>

/** All recorded data, or one session with its laps when `sessionId` is given. */
export async function readDump(
    db: RunsheetDatabase,
    sessionId?: string
): Promise<RunsheetDump> {
    const [sessions, laps, traces] = await Promise.all([
        db.getAll("sessions"),
        db.getAll("laps"),
        db.getAll("lap_telemetry"),
    ])
    const recorded = sessions.filter(
        session =>
            !isReference(session) &&
            (sessionId === undefined || session.id === sessionId)
    )
    const ids = new Set(recorded.map(session => session.id))
    const ownLaps = laps.filter(lap => ids.has(lap.sessionId))
    const lapIds = new Set(ownLaps.map(lap => lap.id))
    return {
        format: DUMP_FORMAT,
        version: DUMP_VERSION,
        dbVersion: DB_VERSION,
        exportedAt: Date.now(),
        sessions: recorded,
        laps: ownLaps,
        traces: traces
            .filter(trace => lapIds.has(trace.lapId))
            .map(encodeTrace),
    }
}

export async function writeDump(
    db: RunsheetDatabase,
    dump: RunsheetDump
): Promise<void> {
    const parsed = parseDump(dump)
    const tx = db.transaction(
        ["sessions", "laps", "lap_telemetry"],
        "readwrite"
    )
    const sessions = tx.objectStore("sessions")
    const laps = tx.objectStore("laps")
    const telemetry = tx.objectStore("lap_telemetry")
    await Promise.all([
        ...parsed.sessions.map(session => sessions.put(session)),
        ...parsed.laps.map(lap => laps.put(lap)),
        ...parsed.traces.map(trace => telemetry.put(decodeTrace(trace))),
        tx.done,
    ])
}

export async function parseDumpFile(file: File): Promise<RunsheetDump> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (isBinaryDump(bytes)) return parseDump(await decodeBinaryDump(bytes))
    let raw: unknown
    try {
        raw = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
        throw new Error("Файл не является JSON")
    }
    return parseDump(raw)
}

export function parseDump(raw: unknown): RunsheetDump {
    if (!isRecord(raw)) throw new Error("Снимок должен быть объектом")
    if (raw.format !== DUMP_FORMAT) {
        throw new Error(`Неизвестный format: ${String(raw.format)}`)
    }
    if (raw.version !== DUMP_VERSION) {
        throw new Error(`Неподдерживаемая version: ${String(raw.version)}`)
    }
    if (
        !Array.isArray(raw.sessions) ||
        !Array.isArray(raw.laps) ||
        !Array.isArray(raw.traces)
    ) {
        throw new Error("sessions, laps и traces должны быть массивами")
    }

    const sessions = raw.sessions.map(parseSession)
    const laps = raw.laps.map(parseLap)
    const traces = raw.traces.map(parseEncodedTrace)
    const exportedAt =
        typeof raw.exportedAt === "number" && Number.isFinite(raw.exportedAt)
            ? raw.exportedAt
            : Date.now()
    const dbVersion =
        typeof raw.dbVersion === "number" && Number.isFinite(raw.dbVersion)
            ? raw.dbVersion
            : DB_VERSION

    return {
        format: DUMP_FORMAT,
        version: DUMP_VERSION,
        dbVersion,
        exportedAt,
        sessions,
        laps,
        traces,
    }
}

/**
 * Dump as indented JSON. Objects get one key per line; arrays of plain
 * values stay on one line, so a trace of thousands of samples does not
 * grow into thousands of lines and the file stays close to its compact size.
 */
export function stringifyDump(dump: RunsheetDump): string {
    return indentJson(dump, 0)
}

function indentJson(value: unknown, depth: number): string {
    if (Array.isArray(value)) {
        const plain = value.every(
            item => item === null || typeof item !== "object"
        )
        if (plain) return JSON.stringify(value)
        const pad = "  ".repeat(depth + 1)
        const items = value.map(item => pad + indentJson(item, depth + 1))
        return `[\n${items.join(",\n")}\n${"  ".repeat(depth)}]`
    }
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value).filter(
            ([, item]) => item !== undefined
        )
        if (entries.length === 0) return "{}"
        const pad = "  ".repeat(depth + 1)
        const lines = entries.map(
            ([key, item]) =>
                `${pad}${JSON.stringify(key)}: ${indentJson(item, depth + 1)}`
        )
        return `{\n${lines.join(",\n")}\n${"  ".repeat(depth)}}`
    }
    return JSON.stringify(value) ?? "null"
}

export type ExportFormat = "json" | "binary"

export const BINARY_EXTENSION = "runsheet"

export type ExportFile = {
    format: ExportFormat
    name: string
    bytes: Uint8Array
    mime: string
}

/** The dump as a file of the chosen format; its length is the exact size. */
export async function buildExport(
    dump: RunsheetDump,
    format: ExportFormat,
    label?: string
): Promise<ExportFile> {
    if (format === "binary") {
        return {
            format,
            name: dumpFileName(dump.exportedAt, BINARY_EXTENSION, label),
            bytes: await encodeBinaryDump(dump),
            mime: "application/octet-stream",
        }
    }
    return {
        format,
        name: dumpFileName(dump.exportedAt, "json", label),
        bytes: new TextEncoder().encode(stringifyDump(dump)),
        mime: "application/json",
    }
}

export async function saveExport(file: ExportFile): Promise<boolean> {
    if (isTauri()) {
        const extension = file.format === "binary" ? BINARY_EXTENSION : "json"
        const body = await invoke<CommandBody<boolean>>(
            "save_file",
            file.bytes,
            {
                headers: {
                    "x-file-name": file.name,
                    "x-file-label":
                        file.format === "binary" ? "Runsheet" : "JSON",
                    "x-file-extension": extension,
                },
            }
        )
        if (body.status === "error") {
            throw new Error(body.message)
        }
        return body.data
    }
    const blob = new Blob([file.bytes as BlobPart], { type: file.mime })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = file.name
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    return true
}

type CommandBody<T> =
    | { status: "success"; data: T }
    | { status: "error"; message: string; hint: string }

export function dumpFileName(
    exportedAt: number,
    extension: string = "json",
    label?: string
): string {
    const day = new Date(exportedAt)
    const yyyy = day.getFullYear()
    const mm = String(day.getMonth() + 1).padStart(2, "0")
    const dd = String(day.getDate()).padStart(2, "0")
    return `runsheet-${label ? `${label}-` : ""}${yyyy}-${mm}-${dd}.${extension}`
}

export function encodeTrace(trace: Trace): EncodedTrace {
    const encoded = { lapId: trace.lapId } as EncodedTrace
    for (const channel of TRACE_CHANNELS) {
        encoded[channel] = Array.from(trace[channel])
    }
    return encoded
}

export function decodeTrace(encoded: EncodedTrace): Trace {
    const count = channelLength(encoded)
    const trace = { lapId: encoded.lapId } as Trace
    for (const channel of TRACE_CHANNELS) {
        const samples = encoded[channel]
        trace[channel] =
            samples && samples.length === count
                ? Float32Array.from(samples)
                : new Float32Array(count)
    }
    return trace
}

function channelLength(encoded: EncodedTrace): number {
    for (const channel of TRACE_CHANNELS) {
        const samples = encoded[channel]
        if (samples) return samples.length
    }
    return 0
}

function parseSession(raw: unknown): Session {
    if (!isRecord(raw)) throw new Error("Session должен быть объектом")
    const id = requireString(raw, "id")
    const outingId = requireString(raw, "outingId")
    const track = requireString(raw, "track")
    const car = requireString(raw, "car")
    const typeRaw = requireString(raw, "type")
    if (!isSessionType(typeRaw)) {
        throw new Error(`Неизвестный тип сессии: ${typeRaw}`)
    }
    const status = raw.status
    if (status !== "live" && status !== "closed") {
        throw new Error(`Неизвестный статус сессии: ${String(status)}`)
    }
    return {
        id,
        outingId,
        startedAt: requireFinite(raw, "startedAt"),
        endedAt: optionalFinite(raw.endedAt),
        online: requireBoolean(raw, "online"),
        track,
        car,
        driver: typeof raw.driver === "string" ? raw.driver : "",
        carId:
            typeof raw.carId === "number" && Number.isInteger(raw.carId)
                ? raw.carId
                : 0,
        type: typeRaw,
        carCount: requireFinite(raw, "carCount"),
        status: status as SessionStatus,
        airTemp: requireFinite(raw, "airTemp"),
        roadTemp: requireFinite(raw, "roadTemp"),
    }
}

function parseLap(raw: unknown): Lap {
    if (!isRecord(raw)) throw new Error("Lap должен быть объектом")
    return {
        id: requireString(raw, "id"),
        sessionId: requireString(raw, "sessionId"),
        number: requireFinite(raw, "number"),
        timeMs: optionalFinite(raw.timeMs),
        s1Ms: optionalFinite(raw.s1Ms),
        s2Ms: optionalFinite(raw.s2Ms),
        s3Ms: optionalFinite(raw.s3Ms),
        s1EndM: optionalFinite(raw.s1EndM),
        s2EndM: optionalFinite(raw.s2EndM),
        valid: requireBoolean(raw, "valid"),
        maxSpeed: requireFinite(raw, "maxSpeed"),
        fuel: requireFinite(raw, "fuel"),
        tc: optionalFinite(raw.tc) ?? 0,
        abs: optionalFinite(raw.abs) ?? 0,
        engineMap: optionalFinite(raw.engineMap) ?? 0,
        brakeBias: optionalFinite(raw.brakeBias) ?? 0,
    }
}

function parseEncodedTrace(raw: unknown): EncodedTrace {
    if (!isRecord(raw)) throw new Error("Trace должен быть объектом")
    const lapId = requireString(raw, "lapId")
    const encoded = { lapId } as EncodedTrace
    let length: number | undefined
    for (const channel of TRACE_CHANNELS) {
        const samples = raw[channel]
        if (samples == null) continue
        if (!Array.isArray(samples) || !samples.every(isFiniteNumber)) {
            throw new Error(`Канал ${channel} должен быть массивом чисел`)
        }
        if (length == null) length = samples.length
        else if (samples.length !== length) {
            throw new Error(
                `Канал ${channel} длиной ${samples.length}, ожидалось ${length}`
            )
        }
        encoded[channel] = samples
    }
    if (length == null) {
        throw new Error("Trace не содержит ни одного канала")
    }
    for (const channel of TRACE_CHANNELS) {
        encoded[channel] ??= Array.from({ length }, () => 0)
    }
    return encoded
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

function requireString(record: Record<string, unknown>, key: string): string {
    const value = record[key]
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Поле ${key} должно быть непустой строкой`)
    }
    return value
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
    const value = record[key]
    if (typeof value !== "boolean") {
        throw new Error(`Поле ${key} должно быть boolean`)
    }
    return value
}

function requireFinite(record: Record<string, unknown>, key: string): number {
    const value = record[key]
    if (!isFiniteNumber(value)) {
        throw new Error(`Поле ${key} должно быть числом`)
    }
    return value
}

function optionalFinite(value: unknown): number | null {
    if (value == null) return null
    if (!isFiniteNumber(value)) {
        throw new Error("Опциональное поле должно быть числом или null")
    }
    return value
}
