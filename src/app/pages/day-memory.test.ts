import { describe, expect, it } from "vitest"
import {
    applyDayWrite,
    projectDay,
    type DayMemory,
} from "~/app/pages/day-memory"
import type { Lap, Session, Trace } from "~/domain"
import { TRACE_CHANNELS } from "~/domain/trace"

const session = (id = "live"): Session => ({
    id,
    outingId: "outing",
    startedAt: 1,
    endedAt: null,
    online: false,
    track: "spa",
    car: "bmw_m4",
    type: "practice",
    carCount: 1,
    status: "live",
    airTemp: 20,
    roadTemp: 28,
})

const lap = (id: string, number: number, timeMs: number | null): Lap => ({
    id,
    sessionId: "live",
    number,
    timeMs,
    s1Ms: timeMs === null ? 30_000 : 30_000,
    s2Ms: null,
    s3Ms: null,
    s1EndM: null,
    s2EndM: null,
    valid: timeMs !== null,
    maxSpeed: 200,
    fuel: 40,
})

const trace = (lapId: string): Trace => {
    const samples = { lapId } as Trace
    for (const channel of TRACE_CHANNELS) {
        samples[channel] = Float32Array.from([0, 1])
    }
    samples.distance = Float32Array.from([0, 100])
    samples.x = Float32Array.from([0, 10])
    samples.z = Float32Array.from([0, 5])
    return samples
}

const empty = (): DayMemory => ({ past: [], live: undefined })

describe("applyDayWrite", () => {
    it("добавляет следующий круг, не затирая уже закрытый", () => {
        const first = applyDayWrite(
            empty(),
            {
                session: session(),
                lap: lap("l1", 1, 90_000),
                trace: trace("l1"),
            },
            "live"
        )
        const second = applyDayWrite(
            first,
            {
                session: session(),
                lap: lap("l2", 2, null),
                trace: trace("l2"),
            },
            "live"
        )
        const sheet = projectDay(second)

        expect(sheet.live?.rows.map(row => row.lap.number)).toEqual([1, 2])
        expect(sheet.live?.road?.lapId).toBe("l1")
        expect(sheet.live?.line?.lapId).toBe("l2")
        expect(first.past).toBe(second.past)
    })
})
