import { describe, expect, it } from "vitest"
import {
    MAX_COMPARE_LAPS,
    normalizeLapIds,
    parseStoredComparison,
    restoreComparison,
} from "~/app/telemetry/compare-selection"

describe("parseStoredComparison", () => {
    it("reads lapIds", () => {
        expect(parseStoredComparison('{"lapIds":["a","b","c"]}')).toEqual({
            lapIds: ["a", "b", "c"],
        })
    })

    it("upgrades the old primary/reference pair", () => {
        expect(
            parseStoredComparison(
                '{"primaryId":"a","referenceId":"b"}'
            )
        ).toEqual({ lapIds: ["a", "b"] })
    })
})

describe("normalizeLapIds", () => {
    it("dedupes and caps at four", () => {
        expect(
            normalizeLapIds(["a", "a", "b", "c", "d", "e"])
        ).toEqual(["a", "b", "c", "d"])
        expect(MAX_COMPARE_LAPS).toBe(4)
    })
})

describe("restoreComparison", () => {
    it("keeps same-track overlays against the baseline", () => {
        expect(
            restoreComparison(
                [
                    { id: "a", track: "spa" },
                    { id: "b", track: "spa" },
                    { id: "c", track: "monza" },
                ],
                { lapIds: ["a", "b", "c"] }
            )
        ).toEqual({ lapIds: ["a", "b"] })
    })
})
