import { describe, expect, it } from "vitest"
import { deltaAreas } from "~/app/telemetry/delta-fill"

describe("deltaAreas", () => {
    it("fills above zero as slower", () => {
        const areas = deltaAreas(
            [
                { x: 0, y: 10 },
                { x: 10, y: 10 },
            ],
            20
        )
        expect(areas).toEqual([
            { side: "slower", polygon: [0, 10, 10, 10, 10, 20, 0, 20] },
        ])
    })

    it("fills below zero as faster", () => {
        const areas = deltaAreas(
            [
                { x: 0, y: 30 },
                { x: 10, y: 30 },
            ],
            20
        )
        expect(areas.map(area => area.side)).toEqual(["faster"])
    })

    it("cuts the area at a zero crossing", () => {
        const areas = deltaAreas(
            [
                { x: 0, y: 10 },
                { x: 10, y: 30 },
            ],
            20
        )
        expect(areas.map(area => area.side)).toEqual(["slower", "faster"])
        expect(areas[0].polygon).toEqual([0, 10, 5, 20, 5, 20, 0, 20])
        expect(areas[1].polygon).toEqual([5, 20, 10, 30, 10, 20, 5, 20])
    })

    it("draws nothing for a flat zero line or a single point", () => {
        expect(deltaAreas([{ x: 0, y: 20 }], 20)).toEqual([])
        expect(
            deltaAreas(
                [
                    { x: 0, y: 20 },
                    { x: 5, y: 20 },
                ],
                20
            )
        ).toEqual([])
    })
})
