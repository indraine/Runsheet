import { describe, expect, it } from "vitest"
import type { Lap, Session } from "~/domain"
import { hasRecordedLaps } from "./empty-session"

const session = { id: "s1", status: "closed", type: "race" } as Session
const lap = { id: "l1", sessionId: "s1", number: 1, timeMs: null } as Lap

describe("empty sessions", () => {
    it("drops a closed session without laps", () => {
        expect(hasRecordedLaps({ session, laps: [] })).toBe(false)
    })

    it("keeps a session with any lap, even an unfinished one", () => {
        expect(hasRecordedLaps({ session, laps: [lap] })).toBe(true)
    })
})
