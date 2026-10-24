import { describe, expect, test } from "vitest"
import { applyDayWrite, type DayMemory } from "~/app/pages/day-memory"
import { shownLive, type Lap, type Session } from "~/domain"

const session = (
    id: string,
    status: Session["status"],
    startedAt: number
): Session => ({
    id,
    outingId: "outing",
    startedAt,
    endedAt: status === "closed" ? startedAt + 1 : null,
    online: false,
    track: "monza",
    car: "bmw_m4_gt3",
    type: "practice",
    carCount: 1,
    status,
    airTemp: 20,
    roadTemp: 26,
})

const lap = (id: string, sessionId: string, number: number): Lap => ({
    id,
    sessionId,
    number,
    timeMs: null,
    s1Ms: null,
    s2Ms: null,
    s3Ms: null,
    s1EndM: null,
    s2EndM: null,
    valid: true,
    maxSpeed: 100,
    fuel: 40,
})

const empty = (): DayMemory => ({ past: [], live: undefined })

describe("shownLive", () => {
    test("a stored live row is not a session", () => {
        const stored = session("seed", "live", 50)
        expect(shownLive([stored], null)).toBeUndefined()
        expect(shownLive([stored])).toBeUndefined()
    })

    test("only the open acc session is shown", () => {
        const stored = session("seed", "live", 50)
        const open = session("acc", "live", 10)
        expect(shownLive([stored, open], "acc")).toBe(open)
        expect(shownLive([stored, open], "missing")).toBeUndefined()
    })
})

describe("applyDayWrite", () => {
    test("laps of another live row stay off the card", () => {
        const next = applyDayWrite(
            empty(),
            { session: session("seed", "live", 50), lap: lap("a", "seed", 1) },
            null
        )
        expect(next.live).toBeUndefined()
    })

    test("the second lap is a new row on the open session", () => {
        const open = session("acc", "live", 10)
        const withFirst = applyDayWrite(
            empty(),
            { session: open, lap: lap("a", "acc", 1) },
            "acc"
        )
        const withSecond = applyDayWrite(
            withFirst,
            { session: open, lap: lap("b", "acc", 2) },
            "acc"
        )
        expect(withSecond.live?.laps.map(item => item.number)).toEqual([1, 2])
    })

    test("closing the session hides the card", () => {
        const open = session("acc", "live", 10)
        const live = applyDayWrite(
            empty(),
            { session: open, lap: lap("a", "acc", 1) },
            "acc"
        )
        const closed = applyDayWrite(
            live,
            { session: { ...open, status: "closed", endedAt: 11 } },
            null
        )
        expect(closed.live).toBeUndefined()
        expect(closed.past.map(row => row.session.id)).toEqual(["acc"])
    })
})
