import { describe, expect, it } from "vitest"
import {
    carScreenLength,
    pathHeading,
} from "~/app/telemetry/car-marker"

describe("car-marker", () => {
    it("sizes the car from track metres and zoom, with a readable floor", () => {
        expect(carScreenLength(0.2, 10)).toBe(12)
        expect(carScreenLength(1, 8)).toBeCloseTo(36.8)
        expect(carScreenLength(10, 20)).toBe(56)
    })

    it("reads heading along the screen polyline (0 = up)", () => {
        const up = pathHeading(
            [
                { x: 0, y: 10 },
                { x: 0, y: 0 },
            ],
            [0, 10],
            5
        )
        expect(up).toBeCloseTo(0)

        const right = pathHeading(
            [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
            [0, 10],
            5
        )
        expect(right).toBeCloseTo(Math.PI / 2)
    })
})
