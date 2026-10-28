import { describe, expect, it } from "vitest"
import {
    formatBrakeBias,
    formatFuelPerLap,
    formatPressure,
    previousLap,
} from "~/app/telemetry/setup-format"
import type { Lap } from "~/domain"

const lapNumbered = (number: number): Lap => ({ number }) as Lap

describe("setup-format", () => {
    it("formats brake bias as a percentage", () => {
        expect(formatBrakeBias(0.575)).toBe("57.5%")
    })

    it("shows a dash for missing brake bias", () => {
        expect(formatBrakeBias(0)).toBe("—")
        expect(formatBrakeBias(Number.NaN)).toBe("—")
    })

    it("formats pressure with one decimal", () => {
        expect(formatPressure(27.64)).toBe("27.6")
        expect(formatPressure(undefined)).toBe("—")
        expect(formatPressure(0)).toBe("—")
    })

    it("formats fuel per lap with two decimals", () => {
        expect(formatFuelPerLap(2.846)).toBe("2.85")
        expect(formatFuelPerLap(undefined)).toBe("—")
    })

    it("finds the previous lap only when numbers are consecutive", () => {
        const laps = [lapNumbered(1), lapNumbered(2), lapNumbered(4)]
        expect(previousLap(laps, laps[1]!)?.number).toBe(1)
        expect(previousLap(laps, laps[2]!)).toBeUndefined()
    })
})
