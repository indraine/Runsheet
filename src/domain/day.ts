import type { Session } from "~/domain/session"

export type DayItem = { kind: "session"; session: Session } | { kind: "menu" }

export type DayGroup = {
    start: number
    sessions: Session[]
}

export const groupByDay = (sessions: readonly Session[]): DayGroup[] => {
    const groups = new Map<number, Session[]>()
    for (const session of sessions) {
        const start = localDayStart(session.startedAt)
        const rows = groups.get(start)
        if (rows) rows.push(session)
        else groups.set(start, [session])
    }

    return [...groups.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([start, rows]) => ({
            start,
            sessions: rows.sort(
                (left, right) => left.startedAt - right.startedAt
            ),
        }))
}

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

export const localDayStart = (at: number): number => {
    const date = new Date(at)
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    ).getTime()
}
