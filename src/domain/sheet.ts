import { groupDay, type DayItem } from "~/domain/day"
import type { Session, SessionType } from "~/domain/session"

/** Type filter on the day sheet. Hotlap and hotstint stay under `all`. */
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

/**
 * Closed rows for the lower sheet.
 * A live session is omitted: it belongs on the open card, not in this list.
 * Menu markers are rebuilt so a hidden row cannot leave a stray divider.
 */
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
