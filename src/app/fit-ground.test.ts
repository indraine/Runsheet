import { describe, expect, it } from "vitest"
import { fitFrame } from "~/app/fit-ground"

describe("fitFrame", () => {
    it("кладёт короткий круг в рамку дороги, а не растягивает его на полотно", () => {
        const road = {
            x: Float32Array.from([0, 100, 100, 0]),
            z: Float32Array.from([0, 0, 100, 100]),
        }
        const line = {
            x: Float32Array.from([10, 12]),
            z: Float32Array.from([10, 12]),
        }

        const [roadPoints, linePoints] = fitFrame([road, line], 200, 200, 0)
        const alone = fitFrame([line], 200, 200, 0)[0]

        expect(roadPoints[0]).toEqual({ x: 0, y: 200 })
        expect(roadPoints[1]).toEqual({ x: 200, y: 200 })
        expect(linePoints[0].x).toBeCloseTo(20)
        expect(linePoints[0].y).toBeCloseTo(180)
        expect(alone[0]).toEqual({ x: 0, y: 200 })
    })
})
