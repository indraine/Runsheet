import type { SessionRepository } from "~/db"
import type { Session } from "~/domain"
import { decodeLapPacket, type DecodedLap } from "~/ipc/packet"
import type { AccStatus } from "~/ipc/status"

/** Кладёт статус и пачки в репозиторий, не затирая закрытые выезды. */
export type AccIngest = {
    applyStatus: (repo: SessionRepository, status: AccStatus) => Promise<void>
    applyPacket: (repo: SessionRepository, buffer: ArrayBuffer) => Promise<void>
}

/**
 * Один приёмник на окно.
 * Пока сессии в базе нет, последняя пачка круга ждёт её.
 * Повтор того же id не создаёт вторую строку.
 */
export const createAccIngest = (): AccIngest => {
    const pending = new Map<string, DecodedLap>()
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
        const next = liveSession(status)
        if (!next) return
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
        if (stored.status === "closed") return

        await repo.upsert({
            session: stored,
            lap: decoded.lap,
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
            await repo.upsert({
                session,
                lap: item.lap,
                trace: item.trace,
            })
            pending.delete(item.lap.id)
        }
    }

    return { applyStatus, applyPacket }
}

/**
 * Живая сессия из статуса. Пока связи нет, в базу ничего не пишется — сид остаётся.
 * Верхние температуры свежее снимка, снятого при открытии строки.
 */
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

/** Десятая градуса не считается новой строкой. */
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
