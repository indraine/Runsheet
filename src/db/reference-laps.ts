import { TRACE_CHANNELS, type Lap, type Session, type Trace } from "~/domain"
import type { RunsheetDatabase } from "~/db/schema"

/** Bump when the bundled files or their conversion change: rows are rewritten. */
export const REFERENCE_VERSION = 1

/** One reference lap as written by `scripts/ld-to-reference.py`. */
export type ReferenceFile = {
    track: string
    car: string
    /** Pilot name from the log; `null` when the log has none. */
    driver: string | null
    recordedAt: number
    timeMs: number
    maxSpeed: number
    lengthM: number
    channels: Partial<Record<(typeof TRACE_CHANNELS)[number], number[]>>
}

export type ReferenceLap = { session: Session; lap: Lap; trace: Trace }

export const referenceId = (file: Pick<ReferenceFile, "track" | "car">) =>
    `ref-${file.track}-${file.car}`

/**
 * Turn a converted MoTeC lap into rows of the store. Channels the log does not
 * have (positions, heading) are zeros, so the map stays hidden for them.
 */
export const referenceLap = (file: ReferenceFile): ReferenceLap => {
    const id = referenceId(file)
    const count = file.channels.distance?.length ?? 0
    const trace = { lapId: id } as Trace
    for (const channel of TRACE_CHANNELS) {
        const samples = file.channels[channel]
        trace[channel] =
            samples && samples.length === count
                ? Float32Array.from(samples)
                : new Float32Array(count)
    }
    return {
        session: {
            id,
            outingId: id,
            startedAt: file.recordedAt,
            endedAt: file.recordedAt + file.timeMs,
            online: false,
            track: file.track,
            car: file.car,
            driver: file.driver ?? "",
            carId: 0,
            type: "hotlap",
            carCount: 1,
            status: "closed",
            airTemp: 0,
            roadTemp: 0,
            reference: REFERENCE_VERSION,
        },
        lap: {
            id,
            sessionId: id,
            number: 1,
            timeMs: file.timeMs,
            s1Ms: null,
            s2Ms: null,
            s3Ms: null,
            s1EndM: null,
            s2EndM: null,
            valid: true,
            maxSpeed: file.maxSpeed,
            fuel: 0,
            tc: 0,
            abs: 0,
            engineMap: 0,
            brakeBias: 0,
        },
        trace,
    }
}

const loadFiles = async (): Promise<ReferenceFile[]> => {
    const modules = import.meta.glob<ReferenceFile>("./reference/*.json", {
        import: "default",
    })
    return Promise.all(Object.values(modules).map(load => load()))
}

/**
 * Put the bundled reference laps into the database. Only the missing or
 * outdated ones are written, so a restart costs one read of the sessions.
 *
 * @returns how many laps were written.
 */
export async function seedReferenceLaps(
    db: RunsheetDatabase,
    files?: readonly ReferenceFile[]
): Promise<number> {
    const stored = new Map(
        (await db.getAll("sessions")).map(session => [session.id, session])
    )
    const source = files ?? (await loadFiles())
    const stale = source.filter(file => {
        const row = stored.get(referenceId(file))
        return !row || (row.reference ?? 0) < REFERENCE_VERSION
    })
    if (stale.length === 0) return 0

    const tx = db.transaction(
        ["sessions", "laps", "lap_telemetry"],
        "readwrite"
    )
    for (const file of stale) {
        const { session, lap, trace } = referenceLap(file)
        void tx.objectStore("sessions").put(session)
        void tx.objectStore("laps").put(lap)
        void tx.objectStore("lap_telemetry").put(trace)
    }
    await tx.done
    return stale.length
}
