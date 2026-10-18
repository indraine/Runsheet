import { createSignal, type Accessor, type Setter } from "solid-js"
import {
    fastestValidLap,
    groupDay,
    type DayItem,
    type Lap,
    type Session,
    type Trace,
} from "~/domain"
import type { RunsheetDatabase } from "~/db/schema"

/** A committed session, plus the lap and trace when this write includes them. */
export type SessionWrite = {
    session: Session
    lap?: Lap
    trace?: Trace
}

/** The requested lap, its trace, and the reference lap of the same session. */
export type LapWithReference = {
    lap: Lap
    trace: Trace | undefined
    reference: Lap | undefined
    referenceTrace: Trace | undefined
}

/**
 * Hides IndexedDB behind the day sheet, a lap with its reference, and upsert.
 * `revision` starts at 0 and grows after each committed write, so a screen can
 * refetch without reading the database itself.
 */
export class SessionRepository {
    readonly revision: Accessor<number>

    private readonly database: RunsheetDatabase
    private readonly setRevision: Setter<number>

    constructor(database: RunsheetDatabase) {
        this.database = database
        const [revision, setRevision] = createSignal(0)
        this.revision = revision
        this.setRevision = setRevision
    }

    /** Все сессии, без отбора по дате. */
    async readSessions(): Promise<Session[]> {
        return this.database.getAll("sessions")
    }

    /** Sessions whose local start date is `at`, earliest first, with a menu marker between outings. */
    async readDay(at: number = Date.now()): Promise<DayItem[]> {
        const sessions = await this.database.getAll("sessions")
        const onDay = sessions.filter(session =>
            sameLocalDay(session.startedAt, at)
        )
        return groupDay(onDay)
    }

    /** Laps of one session, in lap-number order. */
    async readLaps(sessionId: string): Promise<Lap[]> {
        const laps = await this.database.getAllFromIndex(
            "laps",
            "sessionId",
            sessionId
        )
        return laps.sort((left, right) => left.number - right.number)
    }

    /** Трейсы указанных кругов. Круг без документа в карту не попадает. */
    async readTraces(lapIds: readonly string[]): Promise<Map<string, Trace>> {
        const found = new Map<string, Trace>()
        if (lapIds.length === 0) return found

        const tx = this.database.transaction("traces", "readonly")
        const store = tx.objectStore("traces")
        const traces = await Promise.all(lapIds.map(lapId => store.get(lapId)))
        await tx.done
        for (const trace of traces) {
            if (trace) found.set(trace.lapId, trace)
        }
        return found
    }

    /**
     * One lap plus the reference lap. `refLapId` selects a lap of the same session.
     * An unknown id falls back to the fastest valid lap of that session.
     */
    async readLap(
        lapId: string,
        refLapId?: string
    ): Promise<LapWithReference | undefined> {
        const tx = this.database.transaction(["laps", "traces"], "readonly")
        const laps = tx.objectStore("laps")
        const traces = tx.objectStore("traces")
        const lap = await laps.get(lapId)
        if (!lap) {
            await tx.done
            return undefined
        }

        const sessionLaps = await laps.index("sessionId").getAll(lap.sessionId)
        const reference = pickReference(sessionLaps, refLapId)
        const [trace, referenceTrace] = await Promise.all([
            traces.get(lap.id),
            reference ? traces.get(reference.id) : undefined,
            tx.done,
        ])

        return { lap, trace, reference, referenceTrace }
    }

    /** Inserts or replaces the session and, when present, its lap and trace. One transaction. */
    async upsert(write: SessionWrite): Promise<void> {
        assertWrite(write)
        const tx = this.database.transaction(
            ["sessions", "laps", "traces"],
            "readwrite"
        )
        const writes: Promise<unknown>[] = [
            tx.objectStore("sessions").put(write.session),
        ]
        if (write.lap) writes.push(tx.objectStore("laps").put(write.lap))
        if (write.trace) writes.push(tx.objectStore("traces").put(write.trace))
        await Promise.all([...writes, tx.done])
        this.setRevision(current => current + 1)
    }
}

function assertWrite(write: SessionWrite): void {
    const { session, lap, trace } = write
    if (lap && lap.sessionId !== session.id) {
        throw new Error(
            `Lap ${lap.id} belongs to session ${lap.sessionId}, not ${session.id}`
        )
    }
    if (trace && lap && trace.lapId !== lap.id) {
        throw new Error(`Trace ${trace.lapId} does not match lap ${lap.id}`)
    }
}

/** Explicit `refLapId` wins. Otherwise the fastest valid lap with a closed time. */
function pickReference(
    laps: readonly Lap[],
    refLapId?: string
): Lap | undefined {
    if (refLapId) {
        const chosen = laps.find(lap => lap.id === refLapId)
        if (chosen) return chosen
    }
    return fastestValidLap(laps)
}

function sameLocalDay(left: number, right: number): boolean {
    return localDayStart(left) === localDayStart(right)
}

function localDayStart(at: number): number {
    const date = new Date(at)
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    ).getTime()
}
