import { isSessionType, type Session } from "~/domain"

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

export type AccPresence = "off" | "menu" | "inPits" | "onTrack"

export type AccStatus = {
    link: AccLinkState
    presence: AccPresence
    packetId: number | null
    session: Session | null
    lapNumber: number | null
    /** Game sector index, `0..2`, once a lap is open. */
    sector: number | null
    /** Running lap clock from the graphics page, in milliseconds. */
    currentLapMs: number | null
    /** Running time inside the current sector, in milliseconds. */
    sectorMs: number | null
    /** Official first-sector split already recorded on the open lap. */
    s1Ms: number | null
    /** Official second-sector split already recorded on the open lap. */
    s2Ms: number | null
    /** Driving to the line. The sheet shows a hint and does not store a lap. */
    outlap: boolean
    speed: number | null
    airTemp: number | null
    roadTemp: number | null
    events: AccStatusEvent[]
}

/** Lap clock painted on the live card. It is not written to the sheet. */
export type LiveClock = {
    sessionId: string
    outlap: boolean
    lapMs: number | null
    sectorMs: number | null
    sector: 1 | 2 | 3 | null
    s1Ms: number | null
    s2Ms: number | null
}

export type RateMark = {
    at: number
    packetId: number
}

const LINK_STATES = new Set<AccLinkState>(["unavailable", "linked", "lost"])

export const parseAccStatus = (payload: unknown): AccStatus | undefined => {
    const body = unwrapEnvelope(payload)
    if (!isRecord(body)) return undefined
    if (!isLinkState(body.link)) return undefined

    return {
        link: body.link,
        presence: parsePresence(body.presence, body.link),
        packetId: optionalInt(body.packetId),
        session:
            body.session == null ? null : (parseSession(body.session) ?? null),
        lapNumber: optionalInt(body.lapNumber),
        sector: optionalInt(body.sector),
        currentLapMs: optionalInt(body.currentLapMs),
        sectorMs: optionalInt(body.sectorMs),
        s1Ms: optionalInt(body.s1Ms),
        s2Ms: optionalInt(body.s2Ms),
        outlap: body.outlap === true,
        speed: optionalNumber(body.speed),
        airTemp: optionalNumber(body.airTemp),
        roadTemp: optionalNumber(body.roadTemp),
        events: parseEvents(body.events),
    }
}

/**
 * Live lap clock, or an outlap marker while the car is driving to the line.
 *
 * Without a lap number and without `outlap`, the car is on the grid or in
 * the formation lap. A stale graphics time stays off the card.
 *
 * @example
 * ```ts
 * liveClockFromStatus({
 *   link: "linked",
 *   presence: "onTrack",
 *   packetId: 1,
 *   session: null,
 *   lapNumber: null,
 *   sector: null,
 *   currentLapMs: 111_000,
 *   sectorMs: null,
 *   s1Ms: null,
 *   s2Ms: null,
 *   outlap: false,
 *   speed: null,
 *   airTemp: null,
 *   roadTemp: null,
 *   events: [],
 * })
 * // undefined
 * ```
 */
export const liveClockFromStatus = (
    status: AccStatus
): LiveClock | undefined => {
    if (status.link !== "linked" || !status.session) return undefined
    if (status.lapNumber == null) {
        return status.outlap ? outlapClock(status.session.id) : undefined
    }
    if (
        status.currentLapMs == null &&
        status.sectorMs == null &&
        status.s1Ms == null &&
        status.s2Ms == null
    ) {
        return undefined
    }
    return {
        sessionId: status.session.id,
        outlap: false,
        lapMs: status.currentLapMs,
        sectorMs: status.sectorMs,
        sector: sectorNumber(status.sector),
        s1Ms: status.s1Ms,
        s2Ms: status.s2Ms,
    }
}

const outlapClock = (sessionId: string): LiveClock => ({
    sessionId,
    outlap: true,
    lapMs: null,
    sectorMs: null,
    sector: null,
    s1Ms: null,
    s2Ms: null,
})

const sectorNumber = (index: number | null): 1 | 2 | 3 | null => {
    if (index === 0) return 1
    if (index === 1) return 2
    if (index === 2) return 3
    return null
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
    if (typeof value.driver !== "string") return undefined
    if (!isInteger(value.carId)) return undefined
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
        driver: value.driver,
        carId: value.carId,
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

const unwrapEnvelope = (value: unknown): unknown => {
    if (!isRecord(value)) return value
    if (value.status === "success" && "data" in value) return value.data
    return value
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null

const PRESENCE = new Set<AccPresence>(["off", "menu", "inPits", "onTrack"])

const parsePresence = (value: unknown, link: AccLinkState): AccPresence => {
    if (typeof value === "string" && PRESENCE.has(value as AccPresence)) {
        return value as AccPresence
    }
    return link === "linked" ? "menu" : "off"
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
