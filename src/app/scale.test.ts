import { describe, expect, it } from "vitest"
import { SCALE_MAX, autoScale, parseScale } from "~/app/scale"

describe("autoScale", () => {
    it("keeps 100% up to the base width", () => {
        expect(autoScale(1100)).toBe(100)
        expect(autoScale(1920)).toBe(100)
    })

    it("grows in steps of 10% on wider windows", () => {
        expect(autoScale(2560)).toBe(130)
        expect(autoScale(3000)).toBe(160)
    })

    it("stops at the maximum", () => {
        expect(autoScale(3840)).toBe(SCALE_MAX)
        expect(autoScale(7680)).toBe(SCALE_MAX)
    })

    it("gives 100% for a width that is not a number", () => {
        expect(autoScale(Number.NaN)).toBe(100)
    })
})

describe("parseScale", () => {
    it("reads a manual scale", () => {
        expect(parseScale("120")).toBe(120)
        expect(parseScale("200")).toBe(200)
    })

    it("follows the window when nothing or auto is stored", () => {
        expect(parseScale(null)).toBeUndefined()
        expect(parseScale("auto")).toBeUndefined()
    })

    it("falls back to auto for a broken or out-of-range value", () => {
        expect(parseScale("abc")).toBeUndefined()
        expect(parseScale("250")).toBeUndefined()
        expect(parseScale("99.5")).toBeUndefined()
    })
})
