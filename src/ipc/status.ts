import { isSessionType, type Session } from "~/domain"

export const ACC_STATUS_EVENT = "acc-status"

export type AccLinkState = "unavailable" | "linked" | "lost"

export type AccStatusEvent =
    | { kind: "outingOpened"; outingId: string }
    | { kind: "sessionOpened"; session: Session }
    | {
          kind: "sessionChanged"
          previousId: string
          endedAt: number
          session: Session
      }
    | {
          kind: "outingClosed"
          outingId: string
          sessionId: string | null
          endedAt: number
      }

export type AccPresence = "off" | "menu" | "onTrack"

export type AccStatus = {
    link: AccLinkState
    presence: AccPresence
    packetId: number | null
    session: Session | null
    lapNumber: number | null
    sector: number | null
    speed: number | null
    inPit: boolean
    airTemp: number | null
    roadTemp: number | null
    events: AccStatusEvent[]
}

export type RateMark = {
    at: number
    packetId: number
}

const LINK_STATES = new Set<AccLinkState>(["unavailable", "linked", "lost"])

export const parseAccStatus = (payload: unknown): AccStatus | undefined => {
    if (!isRecord(payload)) return undefined
    if (!isLinkState(payload.link)) return undefined

    return {
        link: payload.link,
        presence: parsePresence(payload.presence, payload.link),
        packetId: optionalInt(payload.packetId),
        session:
            payload.session == null
                ? null
                : (parseSession(payload.session) ?? null),
        lapNumber: optionalInt(payload.lapNumber),
        sector: optionalInt(payload.sector),
        speed: optionalNumber(payload.speed),
        inPit: payload.inPit === true,
        airTemp: optionalNumber(payload.airTemp),
        roadTemp: optionalNumber(payload.roadTemp),
        events: parseEvents(payload.events),
    }
}

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

const parseEvents = (value: unknown): AccStatusEvent[] => {
    if (!Array.isArray(value)) return []
    const events: AccStatusEvent[] = []
    for (const item of value) {
        const event = parseEvent(item)
        if (event) events.push(event)
    }
    return events
}

const parseEvent = (value: unknown): AccStatusEvent | undefined => {
    if (!isRecord(value) || typeof value.kind !== "string") return undefined

    switch (value.kind) {
        case "outingOpened": {
            const outingId = text(value.outingId)
            return outingId ? { kind: "outingOpened", outingId } : undefined
        }
        case "sessionOpened": {
            const session = parseSession(value.session)
            return session ? { kind: "sessionOpened", session } : undefined
        }
        case "sessionChanged": {
            const previousId = text(value.previousId)
            const session = parseSession(value.session)
            if (!previousId || !session || !isFiniteNumber(value.endedAt)) {
                return undefined
            }
            return {
                kind: "sessionChanged",
                previousId,
                endedAt: value.endedAt,
                session,
            }
        }
        case "outingClosed": {
            const outingId = text(value.outingId)
            if (!outingId || !isFiniteNumber(value.endedAt)) return undefined
            if (value.sessionId == null) {
                return {
                    kind: "outingClosed",
                    outingId,
                    sessionId: null,
                    endedAt: value.endedAt,
                }
            }
            const sessionId = text(value.sessionId)
            if (!sessionId) return undefined
            return {
                kind: "outingClosed",
                outingId,
                sessionId,
                endedAt: value.endedAt,
            }
        }
        default:
            return undefined
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null

const PRESENCE = new Set<AccPresence>(["off", "menu", "onTrack"])

const parsePresence = (value: unknown, link: AccLinkState): AccPresence => {
    if (typeof value === "string" && PRESENCE.has(value as AccPresence)) {
        return value as AccPresence
    }
    return link === "linked" ? "onTrack" : "off"
}

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
