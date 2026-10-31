import type { LiveLapRow } from "~/domain"

export const LIVE_SORT_KEYS = [
    "lap",
    "time",
    "delta",
    "s1",
    "s2",
    "s3",
    "fuel",
    "valid",
] as const

export type LiveSortKey = (typeof LIVE_SORT_KEYS)[number]

export type LiveSort = { key: LiveSortKey; descending: boolean }

/** Header click: ascending, then descending, then the natural lap order. */
export const nextLiveSort = (
    current: LiveSort | undefined,
    key: LiveSortKey
): LiveSort | undefined => {
    if (current?.key !== key) return { key, descending: false }
    if (!current.descending) return { key, descending: true }
    return undefined
}

const valueOf = (row: LiveLapRow, key: LiveSortKey): number | null => {
    switch (key) {
        case "lap":
            return row.lap.number
        case "time":
            return row.lap.timeMs
        case "delta":
            return row.deltaMs
        case "s1":
            return row.lap.s1Ms
        case "s2":
            return row.lap.s2Ms
        case "s3":
            return row.lap.s3Ms
        case "fuel":
            return row.lap.fuel
        case "valid":
            return row.lap.valid ? 1 : 0
    }
}

/** Rows without a value stay at the bottom in either direction. */
export const sortLiveRows = (
    rows: readonly LiveLapRow[],
    sort: LiveSort | undefined
): LiveLapRow[] => {
    if (!sort) return [...rows]
    const sign = sort.descending ? -1 : 1
    return [...rows].sort((left, right) => {
        const a = valueOf(left, sort.key)
        const b = valueOf(right, sort.key)
        if (a === null && b === null) return left.lap.number - right.lap.number
        if (a === null) return 1
        if (b === null) return -1
        if (a !== b) return (a - b) * sign
        return left.lap.number - right.lap.number
    })
}
