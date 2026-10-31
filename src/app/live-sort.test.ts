import { describe, expect, it } from "vitest"
import type { LiveLapRow } from "~/domain"
import { nextLiveSort, sortLiveRows } from "./live-sort"

const row = (
    number: number,
    timeMs: number | null,
    deltaMs: number | null = null,
    valid = true
): LiveLapRow =>
    ({
        lap: {
            id: `lap-${number}`,
            number,
            timeMs,
            s1Ms: null,
            s2Ms: null,
            s3Ms: null,
            fuel: 50 - number,
            valid,
        },
        deltaMs,
        best: false,
    }) as unknown as LiveLapRow

const numbers = (rows: LiveLapRow[]) => rows.map(item => item.lap.number)

describe("live lap sort", () => {
    const rows = [
        row(1, 120_000),
        row(2, 110_000),
        row(3, null),
        row(4, 115_000),
    ]

    it("keeps the natural order without a sort", () => {
        expect(numbers(sortLiveRows(rows, undefined))).toEqual([1, 2, 3, 4])
    })

    it("sorts by time and keeps missing times last in both directions", () => {
        const asc = sortLiveRows(rows, { key: "time", descending: false })
        const desc = sortLiveRows(rows, { key: "time", descending: true })
        expect(numbers(asc)).toEqual([2, 4, 1, 3])
        expect(numbers(desc)).toEqual([1, 4, 2, 3])
    })

    it("sorts by lap number descending", () => {
        const sorted = sortLiveRows(rows, { key: "lap", descending: true })
        expect(numbers(sorted)).toEqual([4, 3, 2, 1])
    })

    it("sorts invalid laps after valid ones when ascending", () => {
        const mixed = [row(1, 1, null, true), row(2, 1, null, false)]
        const sorted = sortLiveRows(mixed, { key: "valid", descending: false })
        expect(numbers(sorted)).toEqual([2, 1])
    })

    it("cycles ascending, descending, off", () => {
        const first = nextLiveSort(undefined, "time")
        expect(first).toEqual({ key: "time", descending: false })
        const second = nextLiveSort(first, "time")
        expect(second).toEqual({ key: "time", descending: true })
        expect(nextLiveSort(second, "time")).toBeUndefined()
        expect(nextLiveSort(second, "lap")).toEqual({
            key: "lap",
            descending: false,
        })
    })
})
