import { describe, expect, it } from "vitest"
import monzaCsv from "~/app/centerlines/Monza.csv?raw"
import {
    orderedForFit,
    resolveFit,
    tracePlanar,
    type FitChoice,
    type FitLine,
} from "~/app/telemetry/fit-asphalt"
import {
    computeTrackBoundaries,
    parseTrackCsv,
    type Placement,
} from "~/app/track-surface"
import type { Trace } from "~/domain"

const center = computeTrackBoundaries(parseTrackCsv(monzaCsv)).center

const traceOf = (
    points: { x: number; y: number }[],
    speed: (index: number) => number
): Trace =>
    ({
        x: Float32Array.from(points, point => point.x),
        z: Float32Array.from(points, point => point.y),
        distance: Float32Array.from(points, (_, index) => index * 4),
        speed: Float32Array.from(points, (_, index) => speed(index)),
    }) as unknown as Trace

const lap = (id: string, speed: (index: number) => number): FitLine => ({
    id,
    trace: traceOf(
        center.map(point => ({ x: point.x * 1.0 + 900, y: point.y - 400 })),
        speed
    ),
})

const fresh = (): [Map<string, Placement>, FitChoice] => [
    new Map(),
    { signature: [] },
]

describe("tracePlanar", () => {
    it("drops points where the car stands or crawls", () => {
        const pit = { x: -5000, y: -5000 }
        const points = [
            ...Array.from({ length: 100 }, () => pit),
            ...center.slice(0, 300),
        ]
        const trace = traceOf(points, index => (index < 100 ? 2 : 150))
        const kept = tracePlanar(trace)
        expect(kept.length).toBe(300)
        expect(kept.some(point => point.x === pit.x)).toBe(false)
    })
})

describe("resolveFit", () => {
    it("fits a full lap", () => {
        const line = lap("full", () => 150)
        const [placements, chosen] = fresh()
        const fit = resolveFit(center, "monza", [line], placements, chosen)
        expect(fit.similarity).toBeDefined()
    })

    it("keeps the asphalt when the baseline cannot be matched", () => {
        const short: FitLine = {
            id: "short",
            trace: traceOf(
                center.slice(0, 20).map(point => ({ x: point.x, y: point.y })),
                () => 150
            ),
        }
        const full = lap("full", () => 150)
        const [placements, chosen] = fresh()
        const fit = resolveFit(
            center,
            "monza",
            orderedForFit([short, full], short),
            placements,
            chosen
        )
        expect(fit.similarity).toBeDefined()
    })

    it("returns nothing when no lap matches", () => {
        const short: FitLine = {
            id: "short",
            trace: traceOf(
                center.slice(0, 20).map(point => ({ x: point.x, y: point.y })),
                () => 150
            ),
        }
        const [placements, chosen] = fresh()
        expect(
            resolveFit(center, "monza", [short], placements, chosen).similarity
        ).toBeUndefined()
    })

    it("reuses the choice while the placements are unchanged", () => {
        const line = lap("full", () => 150)
        const [placements, chosen] = fresh()
        const first = resolveFit(center, "monza", [line], placements, chosen)
        const second = resolveFit(center, "monza", [line], placements, chosen)
        expect(second.similarity).toBe(first.similarity)
    })
})
