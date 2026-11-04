import { describe, expect, it } from "vitest"
import { liveClockFromStatus, parseAccStatus } from "~/ipc/status"

const session = {
    id: "session-1",
    outingId: "outing-1",
    startedAt: 1_700_000_000_000,
    endedAt: null,
    online: false,
    track: "monza",
    car: "bmw_m4_gt3",
    driver: "Nick",
    carId: 3,
    type: "practice",
    carCount: 1,
    status: "live",
    airTemp: 21,
    roadTemp: 27,
}

const linked = {
    link: "linked",
    presence: "onTrack",
    packetId: 40,
    session,
    speed: 80,
    airTemp: 21,
    roadTemp: 27,
    events: [],
}

describe("parseAccStatus", () => {
    it("keeps the garage and pit lane presence", () => {
        expect(
            parseAccStatus({ ...linked, presence: "garage" })?.presence
        ).toBe("garage")
        expect(
            parseAccStatus({ ...linked, presence: "pitLane" })?.presence
        ).toBe("pitLane")
    })
})

describe("liveClockFromStatus", () => {
    it("marks an outlap without painting a lap time", () => {
        const status = parseAccStatus({
            ...linked,
            lapNumber: null,
            sector: null,
            currentLapMs: null,
            sectorMs: null,
            s1Ms: null,
            s2Ms: null,
            outlap: true,
        })

        expect(liveClockFromStatus(status!)).toEqual({
            sessionId: "session-1",
            outlap: true,
            lapMs: null,
            sectorMs: null,
            sector: null,
            s1Ms: null,
            s2Ms: null,
        })
    })

    it("paints the shared-memory clock on an outlap", () => {
        const status = parseAccStatus({
            ...linked,
            lapNumber: null,
            sector: 0,
            currentLapMs: 12_400,
            sectorMs: 12_400,
            s1Ms: null,
            s2Ms: null,
            outlap: true,
        })

        expect(liveClockFromStatus(status!)).toEqual({
            sessionId: "session-1",
            outlap: true,
            lapMs: 12_400,
            sectorMs: 12_400,
            sector: 1,
            s1Ms: null,
            s2Ms: null,
        })
    })

    it("keeps the grid blank when the graphics clock is stale", () => {
        const status = parseAccStatus({
            ...linked,
            lapNumber: null,
            sector: null,
            currentLapMs: 111_000,
            sectorMs: null,
            s1Ms: null,
            s2Ms: null,
            outlap: false,
        })

        expect(liveClockFromStatus(status!)).toBeUndefined()
    })
})
