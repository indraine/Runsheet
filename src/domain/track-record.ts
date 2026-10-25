import { fastestValidLap, type Lap } from "~/domain/lap"
import type { Session } from "~/domain/session"

export type TrackRecord = {
    sessions: number
    lastStartedAt: number
    bestLap: Lap | undefined
}

export const TRACK_SORTS = ["recent", "popular", "name"] as const

export type TrackSort = (typeof TRACK_SORTS)[number]

export const isTrackSort = (value: string): value is TrackSort =>
    (TRACK_SORTS as readonly string[]).includes(value)


export const trackRecords = (
    rows: readonly { session: Session; bestLap: Lap | undefined }[]
): ReadonlyMap<string, TrackRecord> => {
    const byTrack = new Map<
        string,
        { sessions: number; lastStartedAt: number; laps: Lap[] }
    >()
    for (const row of rows) {
        const entry = byTrack.get(row.session.track) ?? {
            sessions: 0,
            lastStartedAt: Number.NEGATIVE_INFINITY,
            laps: [],
        }
        entry.sessions += 1
        if (row.session.startedAt > entry.lastStartedAt) {
            entry.lastStartedAt = row.session.startedAt
        }
        if (row.bestLap) entry.laps.push(row.bestLap)
        byTrack.set(row.session.track, entry)
    }
    return new Map(
        [...byTrack].map(([track, entry]) => [
            track,
            {
                sessions: entry.sessions,
                lastStartedAt: entry.lastStartedAt,
                bestLap: fastestValidLap(entry.laps),
            },
        ])
    )
}


export const sortTracks = (
    codes: readonly string[],
    records: ReadonlyMap<string, TrackRecord>,
    sort: TrackSort
): string[] => {
    const catalog = new Map(codes.map((code, index) => [code, index]))
    const catalogOf = (track: string): number => catalog.get(track) ?? 0

    return [...codes].sort((left, right) => {
        const leftRecord = records.get(left)
        const rightRecord = records.get(right)

        if (sort === "name") return catalogOf(left) - catalogOf(right)

        const leftDriven = leftRecord !== undefined
        const rightDriven = rightRecord !== undefined
        if (leftDriven !== rightDriven) return leftDriven ? -1 : 1

        if (sort === "recent") {
            const byTime =
                (rightRecord?.lastStartedAt ?? 0) -
                (leftRecord?.lastStartedAt ?? 0)
            if (byTime !== 0) return byTime
            const byCount =
                (rightRecord?.sessions ?? 0) - (leftRecord?.sessions ?? 0)
            if (byCount !== 0) return byCount
            return catalogOf(left) - catalogOf(right)
        }

        const byCount =
            (rightRecord?.sessions ?? 0) - (leftRecord?.sessions ?? 0)
        if (byCount !== 0) return byCount
        const byTime =
            (rightRecord?.lastStartedAt ?? 0) - (leftRecord?.lastStartedAt ?? 0)
        if (byTime !== 0) return byTime
        return catalogOf(left) - catalogOf(right)
    })
}
