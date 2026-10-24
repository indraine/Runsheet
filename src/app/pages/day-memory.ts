import type { SessionRepository, SessionWrite } from "~/db"
import {
    fastestValidLap,
    liveCard,
    shownLive,
    type Lap,
    type LiveCard,
    type Session,
    type Trace,
} from "~/domain"

export type DaySession = {
    session: Session
    bestLap: Lap | undefined
}

export type LiveBuffer = {
    session: Session
    laps: Lap[]
    traces: Trace[]
}

/** `last` — последний закрытый заезд: карточка показывает его, пока живого нет. */
export type DayMemory = {
    past: DaySession[]
    live: LiveBuffer | undefined
    last?: LiveBuffer
}

export type DaySheet = {
    past: DaySession[]
    live: LiveCard | undefined
}

export const projectDay = (memory: DayMemory): DaySheet => {
    const shown = memory.live ?? memory.last
    return {
        past: memory.past,
        live: shown
            ? liveCard(shown.session, shown.laps, shown.traces)
            : undefined,
    }
}

export const applyDayWrite = (
    memory: DayMemory,
    write: SessionWrite,
    sessionId: string | null
): DayMemory => {
    if (write.session.status === "closed") return closeSession(memory, write)
    if (!showsLive(write.session, sessionId)) return memory
    return upsertLive(memory, write)
}

export const readStableDay = async (
    repo: SessionRepository,
    sessionId: string | null
): Promise<{ memory: DayMemory; revision: number }> => {
    let revision = repo.revision()
    let memory = await readDayMemory(repo, sessionId)
    while (repo.revision() !== revision) {
        revision = repo.revision()
        memory = await readDayMemory(repo, sessionId)
    }
    return { memory, revision }
}

const readDayMemory = async (
    repo: SessionRepository,
    sessionId: string | null
): Promise<DayMemory> => {
    const sessions = await repo.readSessions()
    const liveSession = shownLive(sessions, sessionId)
    const closed = sessions.filter(session => session.status === "closed")
    const past = await Promise.all(
        closed.map(async session => ({
            session,
            bestLap: fastestValidLap(await repo.readLaps(session.id)),
        }))
    )
    if (liveSession) {
        return { past, live: await readBuffer(repo, liveSession) }
    }
    const latest = latestSession(closed)
    return {
        past,
        live: undefined,
        last: latest ? await readBuffer(repo, latest) : undefined,
    }
}

const readBuffer = async (
    repo: SessionRepository,
    session: Session
): Promise<LiveBuffer> => {
    const laps = await repo.readLaps(session.id)
    const traces = await repo.readTraces(laps.map(lap => lap.id))
    return { session, laps, traces: [...traces.values()] }
}

const latestSession = (sessions: readonly Session[]): Session | undefined =>
    sessions.reduce<Session | undefined>(
        (latest, session) =>
            !latest || session.startedAt > latest.startedAt ? session : latest,
        undefined
    )

const showsLive = (session: Session, sessionId: string | null): boolean =>
    sessionId !== null && session.id === sessionId

const upsertLive = (memory: DayMemory, write: SessionWrite): DayMemory => {
    const current = memory.live
    if (!current || current.session.id !== write.session.id) {
        return { ...memory, live: bufferFrom(write) }
    }
    return {
        ...memory,
        live: {
            session: write.session,
            laps: write.lap ? upsertLap(current.laps, write.lap) : current.laps,
            traces: write.trace
                ? upsertTrace(current.traces, write.trace)
                : current.traces,
        },
    }
}

const closeSession = (memory: DayMemory, write: SessionWrite): DayMemory => {
    const session: Session = { ...write.session, status: "closed" }
    const buffer =
        memory.live?.session.id === session.id ? memory.live : undefined
    const laps = buffer
        ? write.lap
            ? upsertLap(buffer.laps, write.lap)
            : buffer.laps
        : write.lap
          ? [write.lap]
          : []
    return {
        past: upsertPast(memory.past, {
            session,
            bestLap: fastestValidLap(laps),
        }),
        live: buffer ? undefined : memory.live,
        last: buffer ? { session, laps, traces: buffer.traces } : memory.last,
    }
}

const bufferFrom = (write: SessionWrite): LiveBuffer => ({
    session: write.session,
    laps: write.lap ? [write.lap] : [],
    traces: write.trace ? [write.trace] : [],
})

const upsertLap = (laps: readonly Lap[], lap: Lap): Lap[] => {
    const index = laps.findIndex(item => item.id === lap.id)
    if (index < 0) {
        return [...laps, lap].sort((left, right) => left.number - right.number)
    }
    const next = laps.slice()
    next[index] = lap
    return next
}

const upsertTrace = (traces: readonly Trace[], trace: Trace): Trace[] => {
    const index = traces.findIndex(item => item.lapId === trace.lapId)
    if (index < 0) return [...traces, trace]
    const next = traces.slice()
    next[index] = trace
    return next
}

const upsertPast = (
    past: readonly DaySession[],
    row: DaySession
): DaySession[] => {
    const index = past.findIndex(item => item.session.id === row.session.id)
    if (index < 0) return [...past, row]
    const next = past.slice()
    next[index] = row
    return next
}
