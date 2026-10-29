import { describe, expect, it } from "vitest"
import { TRACE_CHANNELS, type Lap, type Session, type Trace } from "~/domain"
import { motecFileName, packMotecLap, unpackMotecLap } from "~/db/motec"

const session: Session = {
    id: "11111111-1111-1111-1111-111111111111",
    outingId: "11111111-1111-1111-1111-111111111111",
    startedAt: 1_704_067_200_000,
    endedAt: 1_704_067_290_000,
    online: false,
    track: "monza",
    car: "bmw_m4_gt3",
    driver: "Nick",
    carId: 1,
    type: "practice",
    carCount: 1,
    status: "closed",
    airTemp: 20,
    roadTemp: 28,
}

const lap: Lap = {
    id: "22222222-2222-2222-2222-222222222222",
    sessionId: session.id,
    number: 3,
    timeMs: 110_000,
    s1Ms: 35_000,
    s2Ms: 38_000,
    s3Ms: 37_000,
    s1EndM: 1000,
    s2EndM: 2000,
    valid: true,
    maxSpeed: 280,
    fuel: 40,
    tc: 4,
    abs: 3,
    engineMap: 2,
    brakeBias: 0.55,
}

function sampleTrace(): Trace {
    const count = 4
    const trace = { lapId: lap.id } as Trace
    for (const channel of TRACE_CHANNELS) {
        trace[channel] = new Float32Array(count)
    }
    trace.distance = Float32Array.from([0, 10, 20, 30])
    trace.time = Float32Array.from([0, 50, 100, 150])
    trace.speed = Float32Array.from([80, 100, 120, 110])
    trace.throttle = Float32Array.from([0.2, 0.5, 1, 0])
    trace.brake = Float32Array.from([0, 0, 0, 0.8])
    return trace
}

describe("motec pack/unpack", () => {
    it("packs session metadata and all trace channels", () => {
        const packed = packMotecLap(session, lap, sampleTrace())
        expect(packed.meta.venue).toBe("monza")
        expect(packed.meta.vehicle).toBe("bmw_m4_gt3")
        expect(packed.meta.comment).toBe("L3")
        expect(packed.sampleRateHz).toBe(20)
        expect(packed.channels.speed).toEqual([80, 100, 120, 110])
        expect(packed.channels.throttle[0]).toBeCloseTo(0.2)
        expect(packed.channels.throttle[3]).toBe(0)
    })

    it("unpacks into a closed session write", () => {
        const packed = packMotecLap(session, lap, sampleTrace())
        const write = unpackMotecLap(packed)
        expect(write.session?.track).toBe("monza")
        expect(write.session?.status).toBe("closed")
        expect(write.lap?.number).toBe(3)
        expect(write.lap?.maxSpeed).toBe(120)
        expect(write.trace?.speed[2]).toBe(120)
        expect(write.trace?.lapId).toBe(write.lap?.id)
    })

    it("builds a stable file name", () => {
        expect(motecFileName(session, lap)).toBe(
            "20240101-monza-bmw_m4_gt3-L3.ld"
        )
    })
})
