import { describe, expect, it } from "vitest"
import { nextScale, parseScale, type UiScale } from "~/app/scale"

describe("parseScale", () => {
    it("keeps a stored step", () => {
        expect(parseScale("80")).toBe(80)
        expect(parseScale("150")).toBe(150)
    })

    it("falls back when the stored value is missing or unknown", () => {
        expect(parseScale(null)).toBe(100)
        expect(parseScale("")).toBe(100)
        expect(parseScale("70")).toBe(100)
        expect(parseScale("105")).toBe(100)
        expect(parseScale("nope")).toBe(100)
    })
})

describe("nextScale", () => {
    it("steps between the fixed sizes", () => {
        expect(nextScale(100, 1)).toBe(110)
        expect(nextScale(100, -1)).toBe(90)
    })

    it("stops at the ends", () => {
        expect(nextScale(80, -1)).toBe(80)
        expect(nextScale(150, 1)).toBe(150)
    })

    it("covers every step", () => {
        const forward: UiScale[] = []
        let scale: UiScale = 80
        forward.push(scale)
        while (scale !== 150) {
            scale = nextScale(scale, 1)
            forward.push(scale)
        }
        expect(forward).toEqual([80, 90, 100, 110, 120, 130, 140, 150])
    })
})
