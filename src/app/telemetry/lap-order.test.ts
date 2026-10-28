import { describe, expect, it } from "vitest"
import {
    makeBaselineId,
    replaceLapId,
    toggleLapId,
} from "~/app/telemetry/lap-order"

describe("lap-order", () => {
    it("replaces a slot", () => {
        expect(replaceLapId(["a", "b"], 1, "c")).toEqual(["a", "c"])
    })

    it("ignores a lap already chosen in another slot", () => {
        expect(replaceLapId(["a", "b"], 1, "a")).toEqual(["a", "b"])
    })

    it("ignores an out-of-range slot", () => {
        expect(replaceLapId(["a"], 3, "c")).toEqual(["a"])
    })

    it("swaps a lap with the baseline", () => {
        expect(makeBaselineId(["a", "b", "c"], 2)).toEqual(["c", "b", "a"])
    })

    it("keeps order when the baseline is picked", () => {
        expect(makeBaselineId(["a", "b"], 0)).toEqual(["a", "b"])
    })

    it("toggles a lap on and off", () => {
        expect(toggleLapId(["a"], "b")).toEqual(["a", "b"])
        expect(toggleLapId(["a", "b"], "a")).toEqual(["b"])
    })

    it("does not exceed four laps", () => {
        expect(toggleLapId(["a", "b", "c", "d"], "e")).toEqual([
            "a",
            "b",
            "c",
            "d",
        ])
    })
})
