import { describe, expect, it } from "vitest"
import {
    fuelPerLap,
    meanFuelPerLap,
    stintLapsLeft,
} from "~/app/telemetry/fuel"

describe("fuelPerLap", () => {
    it("uses the fuel drop from the previous finished row", () => {
        expect(
            fuelPerLap(
                { fuel: 55, timeMs: 90_000 },
                { fuel: 58 }
            )
        ).toBe(3)
    })

    it("skips open laps and the first row", () => {
        expect(fuelPerLap({ fuel: 58, timeMs: null }, { fuel: 61 })).toBe(
            undefined
        )
        expect(fuelPerLap({ fuel: 58, timeMs: 90_000 }, undefined)).toBe(
            undefined
        )
    })
})

describe("meanFuelPerLap / stintLapsLeft", () => {
    it("averages finished deltas and estimates the stint", () => {
        const mean = meanFuelPerLap([
            { fuel: 61, timeMs: 91_000 },
            { fuel: 58, timeMs: 90_500 },
            { fuel: 55, timeMs: 90_000 },
        ])
        expect(mean).toBe(3)
        expect(stintLapsLeft(55, mean)).toBe(18)
    })
})
