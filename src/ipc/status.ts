import { isSessionType, type Session } from "~/domain"

/** Имя события Tauri. Совпадает с `ACC_STATUS` в Rust. */
export const ACC_STATUS_EVENT = "acc-status"

/** Связь с памятью ACC. В JSON — `unavailable`, `linked`, `lost`. */
export type AccLinkState = "unavailable" | "linked" | "lost"

/** Снимок `acc-status` после разбора. Сессия уже в типах листа. */
export type AccStatus = {
    link: AccLinkState
    packetId: number | null
    session: Session | null
    lapNumber: number | null
    sector: number | null
    speed: number | null
    airTemp: number | null
    roadTemp: number | null
}

/** Предыдущий пакет, от которого считается частота. */
export type RateMark = {
    at: number
    packetId: number
}

const LINK_STATES = new Set<AccLinkState>(["unavailable", "linked", "lost"])

/**
 * Разбирает JSON события `acc-status`.
 * Чужой `link` — `undefined`. Битая сессия не роняет статус: связь остаётся, сессии нет.
 */
export const parseAccStatus = (payload: unknown): AccStatus | undefined => {
    if (!isRecord(payload)) return undefined
    if (!isLinkState(payload.link)) return undefined

    return {
        link: payload.link,
        packetId: optionalInt(payload.packetId),
        session:
            payload.session == null
                ? null
                : (parseSession(payload.session) ?? null),
        lapNumber: optionalInt(payload.lapNumber),
        sector: optionalInt(payload.sector),
        speed: optionalNumber(payload.speed),
        airTemp: optionalNumber(payload.airTemp),
        roadTemp: optionalNumber(payload.roadTemp),
    }
}

/**
 * Частота по приросту `packetId` за прошедшие миллисекунды.
 * Первый замер и шаг часов назад частоту не дают.
 */
export const packetRate = (
    previous: RateMark | undefined,
    now: number,
    packetId: number
): { hz: number | null; mark: RateMark } => {
    const mark = { at: now, packetId }
    if (!previous) return { hz: null, mark }
    const elapsed = now - previous.at
    const packets = packetId - previous.packetId
    if (elapsed <= 0 || packets < 0) return { hz: null, mark }
    return { hz: Math.round((packets * 1000) / elapsed), mark }
}

const parseSession = (value: unknown): Session | undefined => {
    if (!isRecord(value)) return undefined
    const id = text(value.id)
    const outingId = text(value.outingId)
    const track = text(value.track)
    const car = text(value.car)
    if (!id || !outingId || track === undefined || car === undefined) {
        return undefined
    }
    if (typeof value.type !== "string" || !isSessionType(value.type)) {
        return undefined
    }
    if (!isFiniteNumber(value.startedAt)) return undefined
    if (!isInteger(value.carCount)) return undefined
    if (!isFiniteNumber(value.airTemp) || !isFiniteNumber(value.roadTemp)) {
        return undefined
    }
    if (typeof value.online !== "boolean") return undefined
    if (value.status !== "live") return undefined
    if (value.endedAt !== null && !isFiniteNumber(value.endedAt))
        return undefined

    return {
        id,
        outingId,
        startedAt: value.startedAt,
        endedAt: isFiniteNumber(value.endedAt) ? value.endedAt : null,
        online: value.online,
        track,
        car,
        type: value.type,
        carCount: value.carCount,
        status: "live",
        airTemp: value.airTemp,
        roadTemp: value.roadTemp,
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null

const isLinkState = (value: unknown): value is AccLinkState =>
    typeof value === "string" && LINK_STATES.has(value as AccLinkState)

const text = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value)

const isInteger = (value: unknown): value is number =>
    isFiniteNumber(value) && Number.isInteger(value)

const optionalInt = (value: unknown): number | null =>
    value == null ? null : isInteger(value) ? value : null

const optionalNumber = (value: unknown): number | null =>
    value == null ? null : isFiniteNumber(value) ? value : null
