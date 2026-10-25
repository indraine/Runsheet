import { invoke, isTauri } from "@tauri-apps/api/core"
import {
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


export async function readDump(db: RunsheetDatabase): Promise<RunsheetDump> {
    const [sessions, laps, traces] = await Promise.all([
        db.getAll("sessions"),
        db.getAll("laps"),
        db.getAll("traces"),
    ])
    return {
        format: DUMP_FORMAT,
        version: DUMP_VERSION,
        dbVersion: DB_VERSION,
        exportedAt: Date.now(),
        sessions,
        laps,
        traces: traces.map(encodeTrace),
    }
}


export async function writeDump(
    db: RunsheetDatabase,
    dump: RunsheetDump
): Promise<void> {
    const parsed = parseDump(dump)
    const tx = db.transaction(["sessions", "laps", "traces"], "readwrite")
    const sessions = tx.objectStore("sessions")
    const laps = tx.objectStore("laps")
    const traces = tx.objectStore("traces")
    await Promise.all([
        ...parsed.sessions.map(session => sessions.put(session)),
        ...parsed.laps.map(lap => laps.put(lap)),
        ...parsed.traces.map(trace => traces.put(decodeTrace(trace))),
        tx.done,
    ])
}


export async function parseDumpFile(file: File): Promise<RunsheetDump> {
    let raw: unknown
    try {
        raw = JSON.parse(await file.text())
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


export async function downloadDump(dump: RunsheetDump): Promise<void> {
    const contents = JSON.stringify(dump)
    const name = dumpFileName(dump.exportedAt)
    if (isTauri()) {
        const body = await invoke<CommandBody<boolean>>("save_text_file", {
            defaultName: name,
            contents,
        })
        if (body.status === "error") {
            throw new Error(body.message)
        }
        return
    }
    const blob = new Blob([contents], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = name
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

type CommandBody<T> =
    | { status: "success"; data: T }
    | { status: "error"; message: string; hint: string }

export function dumpFileName(exportedAt: number): string {
    const day = new Date(exportedAt)
    const yyyy = day.getFullYear()
    const mm = String(day.getMonth() + 1).padStart(2, "0")
    const dd = String(day.getDate()).padStart(2, "0")
    return `runsheet-${yyyy}-${mm}-${dd}.json`
}

export function encodeTrace(trace: Trace): EncodedTrace {
    const encoded = { lapId: trace.lapId } as EncodedTrace
    for (const channel of TRACE_CHANNELS) {
        encoded[channel] = Array.from(trace[channel])
    }
    return encoded
}

export function decodeTrace(encoded: EncodedTrace): Trace {
    const trace = { lapId: encoded.lapId } as Trace
    for (const channel of TRACE_CHANNELS) {
        trace[channel] = Float32Array.from(encoded[channel])
    }
    return trace
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
    }
}

function parseEncodedTrace(raw: unknown): EncodedTrace {
    if (!isRecord(raw)) throw new Error("Trace должен быть объектом")
    const lapId = requireString(raw, "lapId")
    const encoded = { lapId } as EncodedTrace
    let length: number | undefined
    for (const channel of TRACE_CHANNELS) {
        const samples = raw[channel]
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
