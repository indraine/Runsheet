import { describe, expect, it } from "vitest"
import { formatSteerDeg, wheelRotationDeg } from "./sample"

describe("steering readout", () => {
    it("shows zero when the wheel is straight", () => {
        expect(formatSteerDeg(0)).toBe("0°")
        expect(formatSteerDeg(0.3)).toBe("0°")
        expect(formatSteerDeg(-0.3)).toBe("0°")
    })

    it("signs left as minus and right as plus", () => {
        expect(formatSteerDeg(-12.4)).toBe("−12°")
        expect(formatSteerDeg(40)).toBe("+40°")
    })

    it("converts ACC radians to degrees with the same sign", () => {
        expect(wheelRotationDeg(Math.PI / 2, 2)).toBeCloseTo(90)
        expect(wheelRotationDeg(-Math.PI / 2, 2)).toBeCloseTo(-90)
        expect(formatSteerDeg(wheelRotationDeg(-0.2, 0.55))).toBe("−11°")
    })

    it("leaves degree traces unchanged", () => {
        expect(wheelRotationDeg(40, 110)).toBe(40)
    })
})
