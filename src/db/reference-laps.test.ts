import { describe, expect, it } from "vitest"
import {
    REFERENCE_VERSION,
    referenceId,
    referenceLap,
    type ReferenceFile,
} from "~/db/reference-laps"
import { hasTrajectory, isReference } from "~/domain"

const files = Object.values(
    import.meta.glob<ReferenceFile>("./reference/*.json", {
        eager: true,
        import: "default",
    })
)

describe("bundled reference laps", () => {
    it("ships one lap for each of the 14 ACC tracks of the MoTeC set", () => {
        expect(files.length).toBe(14)
        const ids = new Set(files.map(referenceId))
        expect(ids.size).toBe(files.length)
    })

    it.each(files.map(file => [referenceId(file), file] as const))(
        "%s is a plausible lap",
        (_, file) => {
            const { session, lap, trace } = referenceLap(file)
            const count = trace.distance.length
            expect(count).toBeGreaterThan(100)
            for (const channel of Object.keys(
                trace
            ) as (keyof typeof trace)[]) {
                if (channel === "lapId") continue
                expect((trace[channel] as Float32Array).length).toBe(count)
            }
            for (let index = 1; index < count; index += 1) {
                expect(trace.distance[index]).toBeGreaterThan(
                    trace.distance[index - 1]
                )
                expect(trace.time[index]).toBeGreaterThanOrEqual(
                    trace.time[index - 1]
                )
            }
            expect(trace.time[count - 1]).toBeLessThanOrEqual(lap.timeMs ?? 0)
            expect(Math.max(...trace.speed)).toBeGreaterThan(150)
            expect(Math.max(...trace.speed)).toBeLessThan(330)
            expect(Math.max(...trace.throttle)).toBeLessThanOrEqual(1)
            expect(Math.max(...trace.brake)).toBeLessThanOrEqual(1)
            expect(Math.min(...trace.gear)).toBeGreaterThanOrEqual(1)
            expect(isReference(session)).toBe(true)
            expect(session.reference).toBe(REFERENCE_VERSION)
            expect(lap.sessionId).toBe(session.id)
            expect(hasTrajectory(trace)).toBe(false)
        }
    )
})

describe("referenceLap", () => {
    it("keeps the pilot name from the log when there is one", () => {
        const base = files[0]
        expect(
            referenceLap({ ...base, driver: "A. Pilot" }).session.driver
        ).toBe("A. Pilot")
        expect(referenceLap({ ...base, driver: null }).session.driver).toBe("")
    })

    it("fills channels the log does not have with zeros", () => {
        const { trace } = referenceLap(files[0])
        expect(Math.max(...trace.x)).toBe(0)
        expect(Math.max(...trace.heading)).toBe(0)
    })
})

describe("isReference", () => {
    it("is false for recorded sessions", () => {
        expect(isReference({})).toBe(false)
        expect(isReference({ reference: 0 })).toBe(false)
        expect(isReference({ reference: 1 })).toBe(true)
    })
})
