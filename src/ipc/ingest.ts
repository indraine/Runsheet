import type { SessionRepository } from "~/db"
import { withRealTimes, type Session } from "~/domain"
import { decodeLapPacket, type DecodedLap } from "~/ipc/packet"
import type { AccStatus, AccStatusEvent } from "~/ipc/status"

export type AccIngest = {
    applyStatus: (repo: SessionRepository, status: AccStatus) => Promise<void>
    applyPacket: (repo: SessionRepository, buffer: ArrayBuffer) => Promise<void>
}

export const createAccIngest = (): AccIngest => {
    const pending = new Map<string, DecodedLap>()
    const closedAt = new Map<string, number>()
    let remembered: Session | undefined
    let chain: Promise<void> = Promise.resolve()

    const enqueue = (job: () => Promise<void>): Promise<void> => {
        const run = chain.then(job)
        chain = run.then(
            () => undefined,
            () => undefined
        )
        return run
    }

    const applyStatus = (
        repo: SessionRepository,
        status: AccStatus
    ): Promise<void> => enqueue(() => writeStatus(repo, status))

    const applyPacket = (
        repo: SessionRepository,
        buffer: ArrayBuffer
    ): Promise<void> => enqueue(() => writePacket(repo, buffer))

    const writeStatus = async (
        repo: SessionRepository,
        status: AccStatus
    ): Promise<void> => {
        for (const event of status.events) {
            await applyClose(repo, event)
        }

        const next = liveSession(status)
        if (!next) return
        const endedAt = closedAt.get(next.id)
        if (endedAt !== undefined) {
            await seal(repo, next, endedAt)
            return
        }
        if (remembered?.id === next.id && remembered.status === "closed") return
        if (remembered?.id === next.id && sameSession(remembered, next)) {
            await flush(repo, remembered)
            return
        }

        const stored = (await repo.readSessions()).find(
            session => session.id === next.id
        )
        if (stored?.status === "closed") {
            remembered = stored
            closedAt.set(stored.id, stored.endedAt ?? stored.startedAt)
            return
        }
        if (stored && sameSession(stored, next)) {
            remembered = stored
            await flush(repo, stored)
            return
        }

        await repo.upsert({ session: next })
        remembered = next
        await flush(repo, next)
    }

    const applyClose = async (
        repo: SessionRepository,
        event: AccStatusEvent
    ): Promise<void> => {
        const close =
            event.kind === "outingClosed"
                ? event.sessionId
                    ? { sessionId: event.sessionId, endedAt: event.endedAt }
                    : undefined
                : event.kind === "sessionChanged"
                  ? { sessionId: event.previousId, endedAt: event.endedAt }
                  : undefined
        if (!close) return

        closedAt.set(close.sessionId, close.endedAt)
        const stored = (await repo.readSessions()).find(
            session => session.id === close.sessionId
        )
        if (!stored) return
        await seal(repo, stored, close.endedAt)
    }

    const seal = async (
        repo: SessionRepository,
        session: Session,
        endedAt: number
    ): Promise<void> => {
        const closed: Session = { ...session, status: "closed", endedAt }
        const unfinished = await unfinishedLap(pending, repo, session.id)
        if (
            session.status === "closed" &&
            session.endedAt === endedAt &&
            !unfinished
        ) {
            remembered = closed
            return
        }

        if (unfinished) {
            await repo.upsert({
                session: closed,
                lap: { ...unfinished.lap, valid: false },
                trace: unfinished.trace,
            })
            pending.delete(unfinished.lap.id)
        } else {
            await repo.upsert({ session: closed })
        }
        remembered = closed
        await flush(repo, closed)
    }

    const writePacket = async (
        repo: SessionRepository,
        buffer: ArrayBuffer
    ): Promise<void> => {
        const decoded = decodeLapPacket(buffer)
        if (!decoded) return

        const stored = (await repo.readSessions()).find(
            session => session.id === decoded.lap.sessionId
        )
        if (!stored) {
            pending.set(decoded.lap.id, decoded)
            return
        }

        const unfinished =
            stored.status === "closed" && decoded.lap.timeMs === null
        if (unfinished && !hasSamples(decoded)) return
        const raw = unfinished ? { ...decoded.lap, valid: false } : decoded.lap
        const lap = withRealTimes(raw)

        await repo.upsert({
            session: stored,
            lap,
            trace: decoded.trace,
        })
        remembered = stored
    }

    const flush = async (
        repo: SessionRepository,
        session: Session
    ): Promise<void> => {
        const ready = [...pending.values()]
            .filter(item => item.lap.sessionId === session.id)
            .sort((left, right) => left.lap.number - right.lap.number)
        for (const item of ready) {
            const raw =
                session.status === "closed" && item.lap.timeMs === null
                    ? { ...item.lap, valid: false }
                    : item.lap
            await repo.upsert({
                session,
                lap: withRealTimes(raw),
                trace: item.trace,
            })
            pending.delete(item.lap.id)
        }
    }

    return { applyStatus, applyPacket }
}

const liveSession = (status: AccStatus): Session | undefined => {
    if (status.link !== "linked" || !status.session) return undefined
    return {
        ...status.session,
        status: "live",
        endedAt: null,
        airTemp: status.airTemp ?? status.session.airTemp,
        roadTemp: status.roadTemp ?? status.session.roadTemp,
    }
}

const sameSession = (left: Session, right: Session): boolean =>
    left.id === right.id &&
    left.outingId === right.outingId &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt &&
    left.online === right.online &&
    left.track === right.track &&
    left.car === right.car &&
    left.type === right.type &&
    left.carCount === right.carCount &&
    left.status === right.status &&
    sameTemp(left.airTemp, right.airTemp) &&
    sameTemp(left.roadTemp, right.roadTemp)

const sameTemp = (left: number, right: number): boolean =>
    Math.round(left * 10) === Math.round(right * 10)

const unfinishedLap = async (
    pending: ReadonlyMap<string, DecodedLap>,
    repo: SessionRepository,
    sessionId: string
): Promise<DecodedLap | undefined> => {
    for (const item of pending.values()) {
        if (item.lap.sessionId !== sessionId || item.lap.timeMs !== null) {
            continue
        }
        if (hasSamples(item)) return item
    }

    const open = (await repo.readLaps(sessionId)).find(
        lap => lap.timeMs === null
    )
    if (!open) return undefined
    const trace = (await repo.readTraces([open.id])).get(open.id)
    if (!trace || trace.distance.length < 1) return undefined
    return { lap: open, trace }
}

const hasSamples = (decoded: DecodedLap): boolean =>
    decoded.trace.distance.length > 0
