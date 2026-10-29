import { describe, expect, it } from "vitest"
import {
    DUMP_FORMAT,
    DUMP_VERSION,
    filterDump,
    type RunsheetDump,
} from "~/db/transfer"

const dump: RunsheetDump = {
    format: DUMP_FORMAT,
    version: DUMP_VERSION,
    dbVersion: 1,
    exportedAt: 1_704_067_200_000,
    sessions: [
        {
            id: "s1",
            outingId: "o1",
            startedAt: 1_704_067_200_000,
            endedAt: null,
            online: false,
            track: "monza",
            car: "bmw_m4_gt3",
            driver: "A",
            carId: 1,
            type: "practice",
            carCount: 1,
            status: "closed",
            airTemp: 20,
            roadTemp: 28,
        },
        {
            id: "s2",
            outingId: "o2",
            startedAt: 1_704_153_600_000,
            endedAt: null,
            online: false,
            track: "spa",
            car: "ferrari_296_gt3",
            driver: "B",
            carId: 2,
            type: "qualifying",
            carCount: 1,
            status: "closed",
            airTemp: 18,
            roadTemp: 24,
        },
    ],
    laps: [
        {
            id: "l1",
            sessionId: "s1",
            number: 1,
            timeMs: 100_000,
            s1Ms: null,
            s2Ms: null,
            s3Ms: null,
            s1EndM: null,
            s2EndM: null,
            valid: true,
            maxSpeed: 250,
            fuel: 40,
            tc: 0,
            abs: 0,
            engineMap: 0,
            brakeBias: 0.5,
        },
        {
            id: "l2",
            sessionId: "s2",
            number: 1,
            timeMs: 120_000,
            s1Ms: null,
            s2Ms: null,
            s3Ms: null,
            s1EndM: null,
            s2EndM: null,
            valid: true,
            maxSpeed: 260,
            fuel: 38,
            tc: 0,
            abs: 0,
            engineMap: 0,
            brakeBias: 0.5,
        },
    ],
    traces: [
        {
            lapId: "l1",
            distance: [0, 1],
            time: [0, 50],
            speed: [0, 0],
            throttle: [0, 0],
            brake: [0, 0],
            steer: [0, 0],
            gear: [0, 0],
            gLong: [0, 0],
            gLat: [0, 0],
            x: [0, 0],
            z: [0, 0],
            pressureFl: [0, 0],
            pressureFr: [0, 0],
            pressureRl: [0, 0],
            pressureRr: [0, 0],
            brakeTempFl: [0, 0],
            brakeTempFr: [0, 0],
            rpm: [0, 0],
            heading: [0, 0],
        },
        {
            lapId: "l2",
            distance: [0, 1],
            time: [0, 50],
            speed: [0, 0],
            throttle: [0, 0],
            brake: [0, 0],
            steer: [0, 0],
            gear: [0, 0],
            gLong: [0, 0],
            gLat: [0, 0],
            x: [0, 0],
            z: [0, 0],
            pressureFl: [0, 0],
            pressureFr: [0, 0],
            pressureRl: [0, 0],
            pressureRr: [0, 0],
            brakeTempFl: [0, 0],
            brakeTempFr: [0, 0],
            rpm: [0, 0],
            heading: [0, 0],
        },
    ],
}

describe("filterDump", () => {
    it("keeps only chosen sessions with related laps and traces", () => {
        const subset = filterDump(dump, new Set(["s1"]))
        expect(subset.sessions.map(session => session.id)).toEqual(["s1"])
        expect(subset.laps.map(lap => lap.id)).toEqual(["l1"])
        expect(subset.traces.map(trace => trace.lapId)).toEqual(["l1"])
        expect(subset.format).toBe(DUMP_FORMAT)
        expect(subset.exportedAt).toBe(dump.exportedAt)
    })

    it("returns empty collections when nothing is selected", () => {
        const subset = filterDump(dump, new Set())
        expect(subset.sessions).toEqual([])
        expect(subset.laps).toEqual([])
        expect(subset.traces).toEqual([])
    })
})
