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
    type: SessionType
    carCount: number
    status: SessionStatus
    airTemp: number
    roadTemp: number
}
