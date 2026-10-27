import { describe, expect, it } from "vitest"
import { layoutDelta, layoutOffset } from "~/app/zoom-space"

describe("layoutOffset", () => {
    it("keeps layout pixels when zoom is 1", () => {
        expect(layoutOffset(150, 100, 200, 200, 1)).toBe(50)
    })

    it("maps a visual click through a rect that does not include zoom", () => {
        expect(layoutOffset(450, 100, 200, 200, 1.5)).toBe(200)
        expect(layoutOffset(150, 100, 200, 200, 1.5)).toBe(0)
    })

    it("maps a visual click when the rect is already zoomed", () => {
        expect(layoutOffset(450, 150, 300, 200, 1.5)).toBe(200)
    })
})

describe("layoutDelta", () => {
    it("divides visual travel by zoom", () => {
        expect(layoutDelta(15, 200, 200, 1.5)).toBe(10)
    })

    it("uses the rect ratio when the rect already includes zoom", () => {
        expect(layoutDelta(15, 300, 200, 1.5)).toBe(10)
    })
})
