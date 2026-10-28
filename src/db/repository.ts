import { batch, createSignal, type Accessor, type Setter } from "solid-js"
import {
    completeLap,
    completeSession,
    fastestValidLap,
    groupDay,
    type DayItem,
    type Lap,
    type Session,
    type Trace,
} from "~/domain"
import type { RunsheetDatabase } from "~/db/schema"
import { readDump, writeDump, type RunsheetDump } from "~/db/transfer"

export type SessionWrite = {
    session: Session
    lap?: Lap
    trace?: Trace
}

export type LapWithReference = {
    lap: Lap
    trace: Trace | undefined
    reference: Lap | undefined
    referenceTrace: Trace | undefined
}

export class SessionRepository {
    readonly revision: Accessor<number>
    readonly lastWrite: Accessor<SessionWrite | undefined>

    private readonly database: RunsheetDatabase
    private readonly setRevision: Setter<number>
    private readonly setLastWrite: Setter<SessionWrite | undefined>

    constructor(database: RunsheetDatabase) {
        this.database = database
        const [revision, setRevision] = createSignal(0)
        const [lastWrite, setLastWrite] = createSignal<SessionWrite>()
        this.revision = revision
        this.lastWrite = lastWrite
        this.setRevision = setRevision
        this.setLastWrite = setLastWrite
    }

    async readSessions(): Promise<Session[]> {
        return loadSessions(this.database)
    }

    async readSession(id: string): Promise<Session | undefined> {
        const session = await this.database.get("sessions", id)
        return session ? completeSession(session) : undefined
    }

    async readDay(at: number = Date.now()): Promise<DayItem[]> {
        const sessions = await loadSessions(this.database)
        const onDay = sessions.filter(session =>
            sameLocalDay(session.startedAt, at)
        )
        return groupDay(onDay)
    }

    async readLaps(sessionId: string): Promise<Lap[]> {
        const laps = await this.database.getAllFromIndex(
            "laps",
            "sessionId",
            sessionId
        )
        return laps
            .map(completeLap)
            .sort((left, right) => left.number - right.number)
    }

    async readTraces(lapIds: readonly string[]): Promise<Map<string, Trace>> {
        const found = new Map<string, Trace>()
        if (lapIds.length === 0) return found

        const tx = this.database.transaction("lap_telemetry", "readonly")
        const store = tx.objectStore("lap_telemetry")
        const traces = await Promise.all(lapIds.map(lapId => store.get(lapId)))
        await tx.done
        for (const trace of traces) {
            if (trace) found.set(trace.lapId, trace)
        }
        return found
    }

    async readLap(
        lapId: string,
        refLapId?: string
    ): Promise<LapWithReference | undefined> {
        const tx = this.database.transaction(
            ["laps", "lap_telemetry"],
            "readonly"
        )
        const laps = tx.objectStore("laps")
        const telemetry = tx.objectStore("lap_telemetry")
        const lap = await laps.get(lapId)
        if (!lap) {
            await tx.done
            return undefined
        }

        const sessionLaps = await laps.index("sessionId").getAll(lap.sessionId)
        const reference = pickReference(sessionLaps, refLapId)
        const [trace, referenceTrace] = await Promise.all([
            telemetry.get(lap.id),
            reference ? telemetry.get(reference.id) : undefined,
            tx.done,
        ])

        return { lap, trace, reference, referenceTrace }
    }

    async upsert(write: SessionWrite): Promise<void> {
        assertWrite(write)
        const tx = this.database.transaction(
            ["sessions", "laps", "lap_telemetry"],
            "readwrite"
        )
        const writes: Promise<unknown>[] = [
            tx.objectStore("sessions").put(write.session),
        ]
        if (write.lap) writes.push(tx.objectStore("laps").put(write.lap))
        if (write.trace) {
            writes.push(tx.objectStore("lap_telemetry").put(write.trace))
        }
        await Promise.all([...writes, tx.done])
        batch(() => {
            this.setLastWrite(write)
            this.setRevision(current => current + 1)
        })
    }

    async exportAll(): Promise<RunsheetDump> {
        return readDump(this.database)
    }

    async importAll(dump: RunsheetDump): Promise<void> {
        await writeDump(this.database, dump)
        this.setRevision(current => current + 1)
    }

    async clearAll(): Promise<void> {
        const tx = this.database.transaction(
            ["sessions", "laps", "lap_telemetry"],
            "readwrite"
        )
        await Promise.all([
            tx.objectStore("sessions").clear(),
            tx.objectStore("laps").clear(),
            tx.objectStore("lap_telemetry").clear(),
            tx.done,
        ])
        batch(() => {
            this.setLastWrite(undefined)
            this.setRevision(current => current + 1)
        })
    }
}

function loadSessions(database: RunsheetDatabase): Promise<Session[]> {
    return database.getAll("sessions").then(rows => rows.map(completeSession))
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
