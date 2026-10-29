import { invoke, isTauri } from "@tauri-apps/api/core"
import {
    TRACE_CHANNELS,
    isSessionType,
    type Lap,
    type Session,
    type SessionType,
    type Trace,
    type TraceChannel,
} from "~/domain"
import type { SessionWrite } from "~/db/repository"

type CommandBody<T> =
    | { status: "success"; data: T }
    | { status: "error"; message: string; hint: string }

export type MotecMeta = {
    driver: string
    vehicle: string
    venue: string
    session: string
    comment: string
    startedAt: number
}

export type MotecChannels = Record<TraceChannel, number[]>

export type MotecLap = {
    meta: MotecMeta
    sampleRateHz: number
    channels: MotecChannels
}

/** MoTeC `.ld` I/O needs the Tauri shell (`bun run tauri dev` / the installed app). */
export const motecAvailable = (): boolean => isTauri()

/**
 * Save one lap as a MoTeC `.ld` via the native file dialog.
 *
 * @example
 * ```ts
 * await exportMotecLap(session, lap, trace)
 * ```
 */
export async function exportMotecLap(
    session: Session,
    lap: Lap,
    trace: Trace
): Promise<boolean> {
    if (!motecAvailable()) {
        throw new Error("motec.desktopOnly")
    }
    const body = await invoke<CommandBody<boolean>>("export_motec_ld", {
        defaultName: motecFileName(session, lap),
        lap: packMotecLap(session, lap, trace),
    })
    if (body.status === "error") throw new Error(body.message)
    return body.data
}

/**
 * Open a MoTeC `.ld` via the native dialog and map it into a session write.
 * Does not persist — caller confirms, then `repo.upsert(write)`.
 *
 * @example
 * ```ts
 * const write = await loadMotecLap()
 * if (write) await repo.upsert(write)
 * ```
 */
export async function loadMotecLap(): Promise<SessionWrite | undefined> {
    if (!motecAvailable()) {
        throw new Error("motec.desktopOnly")
    }
    const body = await invoke<CommandBody<MotecLap | null>>("import_motec_ld")
    if (body.status === "error") throw new Error(body.message)
    if (!body.data) return undefined
    return unpackMotecLap(body.data)
}

/** @deprecated Prefer {@link loadMotecLap}. */
export const importMotecLap = loadMotecLap

export function packMotecLap(
    session: Session,
    lap: Lap,
    trace: Trace
): MotecLap {
    const channels = {} as MotecChannels
    for (const channel of TRACE_CHANNELS) {
        channels[channel] = Array.from(trace[channel])
    }
    return {
        meta: {
            driver: session.driver,
            vehicle: session.car,
            venue: session.track,
            session: session.type,
            comment: `L${lap.number}${lap.valid ? "" : " invalid"}`,
            startedAt: session.startedAt,
        },
        sampleRateHz: estimateRateHz(trace.time),
        channels,
    }
}

export function unpackMotecLap(motec: MotecLap): SessionWrite {
    const count = motec.channels.distance?.length ?? 0
    if (count === 0) throw new Error("MoTeC file has no samples")

    const sessionId = crypto.randomUUID()
    const lapId = crypto.randomUUID()
    const startedAt =
        Number.isFinite(motec.meta.startedAt) && motec.meta.startedAt > 0
            ? motec.meta.startedAt
            : Date.now()
    const durationMs =
        motec.channels.time.length > 1
            ? Math.max(
                  0,
                  (motec.channels.time[motec.channels.time.length - 1] ?? 0) -
                      (motec.channels.time[0] ?? 0)
              )
            : (count / Math.max(1, motec.sampleRateHz)) * 1000

    const session: Session = {
        id: sessionId,
        outingId: sessionId,
        startedAt,
        endedAt: startedAt + Math.round(durationMs),
        online: false,
        track: motec.meta.venue || "unknown",
        car: motec.meta.vehicle || "unknown",
        driver: motec.meta.driver || "",
        carId: 0,
        type: sessionTypeOf(motec.meta.session),
        carCount: 1,
        status: "closed",
        airTemp: 0,
        roadTemp: 0,
    }

    let maxSpeed = 0
    for (const speed of motec.channels.speed ?? []) {
        if (speed > maxSpeed) maxSpeed = speed
    }

    const lap: Lap = {
        id: lapId,
        sessionId,
        number: lapNumberOf(motec.meta.comment),
        timeMs: durationMs > 0 ? Math.round(durationMs) : null,
        s1Ms: null,
        s2Ms: null,
        s3Ms: null,
        s1EndM: null,
        s2EndM: null,
        valid: true,
        maxSpeed,
        fuel: 0,
        tc: 0,
        abs: 0,
        engineMap: 0,
        brakeBias: 0,
    }

    const trace = { lapId } as Trace
    for (const channel of TRACE_CHANNELS) {
        const samples = motec.channels[channel]
        trace[channel] =
            samples && samples.length === count
                ? Float32Array.from(samples)
                : new Float32Array(count)
    }

    return { session, lap, trace }
}

export function motecFileName(session: Session, lap: Lap): string {
    const day = new Date(session.startedAt)
    const yyyy = day.getFullYear()
    const mm = String(day.getMonth() + 1).padStart(2, "0")
    const dd = String(day.getDate()).padStart(2, "0")
    const track = sanitizeName(session.track || "track")
    const car = sanitizeName(session.car || "car")
    return `${yyyy}${mm}${dd}-${track}-${car}-L${lap.number}.ld`
}

function estimateRateHz(time: Float32Array): number {
    if (time.length < 2) return 20
    const first = time[0] ?? 0
    const last = time[time.length - 1] ?? 0
    const span = last - first
    if (!(span > 0)) return 20
    return Math.round(((time.length - 1) * 1000) / span)
}

function sessionTypeOf(raw: string): SessionType {
    const value = raw.trim().toLowerCase()
    if (isSessionType(value)) return value
    if (value.includes("qual")) return "qualifying"
    if (value.includes("race")) return "race"
    if (value.includes("hot")) return "hotlap"
    return "practice"
}

function lapNumberOf(comment: string): number {
    const match = /L\s*(\d+)/i.exec(comment)
    if (!match) return 1
    const number = Number(match[1])
    return Number.isInteger(number) && number > 0 ? number : 1
}

function sanitizeName(value: string): string {
    const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
    return cleaned || "x"
}

export function formatMotecError(error: unknown, fallback: string): string {
    const detail = error instanceof Error ? error.message : String(error)
    if (detail === "motec.desktopOnly") return fallback
    return `${fallback}\n${detail}`
}
