export const SESSION_TYPES = [
    "practice",
    "qualifying",
    "race",
    "hotlap",
    "hotstint",
    "hotlapSuperpole",
    "timeAttack",
    "drift",
    "drag",
    "unknown",
] as const

export type SessionType = (typeof SESSION_TYPES)[number]

export const isSessionType = (value: string): value is SessionType =>
    (SESSION_TYPES as readonly string[]).includes(value)

export type SessionStatus = "live" | "closed"

export type Session = {
    id: string
    outingId: string
    startedAt: number
    endedAt: number | null
    online: boolean
    track: string
    car: string
    /** `player_nick`, or the first and last name when the nick is empty. */
    driver: string
    /** Player car index from the graphics page. */
    carId: number
    type: SessionType
    carCount: number
    status: SessionStatus
    airTemp: number
    roadTemp: number
}

/** Rows written before the driver and car index existed still load. */
export const completeSession = (session: Session): Session => ({
    ...session,
    driver: typeof session.driver === "string" ? session.driver : "",
    carId: Number.isInteger(session.carId) ? session.carId : 0,
})
