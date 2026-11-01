import { describe, expect, it } from "vitest"
import { hasTrajectory, type Trace } from "~/domain/trace"

const traceWith = (x: number[], z: number[]): Trace =>
    ({
        lapId: "lap",
        x: Float32Array.from(x),
        z: Float32Array.from(z),
    }) as unknown as Trace

describe("hasTrajectory", () => {
    it("is true for a real ground track", () => {
        const x = Array.from({ length: 50 }, (_, index) => index * 10)
        const z = Array.from({ length: 50 }, (_, index) => index * 4)
        expect(hasTrajectory(traceWith(x, z))).toBe(true)
    })

    it("is false when positions are missing and stored as zeros", () => {
        const zeros = new Array<number>(200).fill(0)
        expect(hasTrajectory(traceWith(zeros, zeros))).toBe(false)
    })

    it("is false for empty or one-sample traces", () => {
        expect(hasTrajectory(traceWith([], []))).toBe(false)
        expect(hasTrajectory(traceWith([5], [5]))).toBe(false)
    })

    it("is false when the car never leaves one spot", () => {
        const x = Array.from({ length: 50 }, (_, index) => 100 + index * 0.1)
        const z = Array.from({ length: 50 }, () => 200)
        expect(hasTrajectory(traceWith(x, z))).toBe(false)
    })

    it("ignores non-finite samples", () => {
        const x = [Number.NaN, 0, 100, Number.NaN]
        const z = [0, 0, 100, 0]
        expect(hasTrajectory(traceWith(x, z))).toBe(true)
    })
})
