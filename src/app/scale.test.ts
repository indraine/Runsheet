import { describe, expect, it } from "vitest"
import { clampScale, nextScale, parseScale } from "~/app/scale"

describe("parseScale", () => {
    it("keeps a stored percentage", () => {
        expect(parseScale("80")).toBe(80)
        expect(parseScale("125")).toBe(125)
        expect(parseScale("150")).toBe(150)
    })

    it("falls back when the stored value is missing or out of range", () => {
        expect(parseScale(null)).toBe(100)
        expect(parseScale("")).toBe(100)
        expect(parseScale("70")).toBe(100)
        expect(parseScale("151")).toBe(100)
        expect(parseScale("125.5")).toBe(100)
        expect(parseScale("nope")).toBe(100)
    })
})

describe("clampScale", () => {
    it("rounds into the allowed range", () => {
        expect(clampScale(124.6)).toBe(125)
        expect(clampScale(70)).toBe(80)
        expect(clampScale(200)).toBe(150)
    })
})

describe("nextScale", () => {
    it("steps by ten from the current value", () => {
        expect(nextScale(100, 1)).toBe(110)
        expect(nextScale(100, -1)).toBe(90)
        expect(nextScale(125, 1)).toBe(135)
    })

    it("stops at the ends", () => {
        expect(nextScale(80, -1)).toBe(80)
        expect(nextScale(145, 1)).toBe(150)
    })
})
