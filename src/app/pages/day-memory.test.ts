import { describe, expect, it } from "vitest"
import { applyDayWrite, type DayMemory } from "~/app/pages/day-memory"
import type { Lap, Session } from "~/domain"

const session = (
    id: string,
    status: Session["status"],
    type: Session["type"] = "qualifying"
): Session => ({
    id,
    outingId: "outing-1",
    startedAt: 1_700_000_000_000,
    endedAt: status === "closed" ? 1_700_000_060_000 : null,
    online: true,
    track: "spa",
    car: "bmw_m4_gt3",
    driver: "Nick",
    carId: 3,
    type,
    carCount: 20,
    status,
    airTemp: 20,
    roadTemp: 28,
})

const lap = (
    id: string,
    sessionId: string,
    timeMs: number | null,
    valid: boolean
): Lap => ({
    id,
    sessionId,
    number: timeMs === null ? 2 : 1,
    timeMs,
    s1Ms: timeMs === null ? 30_000 : 28_000,
    s2Ms: timeMs === null ? null : 32_000,
    s3Ms: timeMs === null ? null : 30_000,
    s1EndM: 2000,
    s2EndM: timeMs === null ? null : 4500,
    valid,
    maxSpeed: 270,
    fuel: 40,
    tc: 5,
    abs: 6,
    engineMap: 4,
    brakeBias: 0.57,
})

describe("applyDayWrite", () => {
    it("archives the live buffer without waiting for the outing to close", () => {
        const qualifying = session("qual", "live")
        const best = lap("fast", "qual", 90_000, true)
        const open = lap("open", "qual", null, false)
        const memory: DayMemory = {
            past: [],
            live: { session: qualifying, laps: [best, open], traces: [] },
        }

        const next = applyDayWrite(
            memory,
            {
                session: {
                    ...qualifying,
                    status: "closed",
                    endedAt: qualifying.startedAt + 60_000,
                },
            },
            "race"
        )

        expect(next.live).toBeUndefined()
        expect(next.past).toEqual([
            {
                session: {
                    ...qualifying,
                    status: "closed",
                    endedAt: qualifying.startedAt + 60_000,
                },
                bestLap: best,
            },
        ])
    })

    it("keeps the archived best lap when a later close arrives without laps", () => {
        const qualifying = session("qual", "closed")
        const best = lap("fast", "qual", 90_000, true)
        const race = session("race", "live", "race")
        const memory: DayMemory = {
            past: [{ session: qualifying, bestLap: best }],
            live: { session: race, laps: [], traces: [] },
        }

        const next = applyDayWrite(memory, { session: qualifying }, race.id)

        expect(next.past[0]?.bestLap).toEqual(best)
        expect(next.live?.session.id).toBe(race.id)
    })
})
