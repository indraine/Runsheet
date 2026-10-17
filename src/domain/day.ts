import type { Session } from "~/domain/session"

export type DayItem = { kind: "session"; session: Session } | { kind: "menu" }

/** Earliest start at the top. A menu marker sits between different `outingId`s. */
export function groupDay(sessions: readonly Session[]): DayItem[] {
    const ordered = [...sessions].sort(
        (left, right) => left.startedAt - right.startedAt
    )
    const items: DayItem[] = []

    for (const session of ordered) {
        const previous = items[items.length - 1]
        const outingChanged =
            previous?.kind === "session" &&
            previous.session.outingId !== session.outingId
        if (outingChanged) items.push({ kind: "menu" })
        items.push({ kind: "session", session })
    }

    return items
}
