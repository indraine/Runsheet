import { groupDay, type DayItem } from "~/domain/day"
import type { Session, SessionType } from "~/domain/session"

export const SESSION_FILTERS = [
    "all",
    "race",
    "qualifying",
    "practice",
] as const

export type SessionFilter = (typeof SESSION_FILTERS)[number]

export function isSessionFilter(value: string): value is SessionFilter {
    return (SESSION_FILTERS as readonly string[]).includes(value)
}

export function closedSheet(
    sessions: readonly Session[],
    filter: SessionFilter
): DayItem[] {
    const closed = sessions.filter(
        session => session.status === "closed" && matches(session.type, filter)
    )
    return groupDay(closed)
}

function matches(type: SessionType, filter: SessionFilter): boolean {
    if (filter === "all") return true
    return type === filter
}
