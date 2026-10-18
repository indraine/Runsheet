import { describe, expect, it } from "vitest"
import { liveCard, type Lap, type Session, type Trace } from "~/domain"
import { TRACE_CHANNELS } from "~/domain/trace"

const session = (): Session => ({
    id: "session",
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
    sessionId: "session",
    number,
    timeMs,
    s1Ms: null,
    s2Ms: null,
    s3Ms: null,
    s1EndM: null,
    s2EndM: null,
    valid: timeMs !== null,
    maxSpeed: 200,
    fuel: 40,
})

const trace = (
    lapId: string,
    xs: number[],
    zs: number[],
    distances: number[]
): Trace => {
    const count = xs.length
    const zeros = () => Float32Array.from({ length: count }, () => 0)
    const samples = { lapId } as Trace
    for (const channel of TRACE_CHANNELS) samples[channel] = zeros()
    samples.x = Float32Array.from(xs)
    samples.z = Float32Array.from(zs)
    samples.distance = Float32Array.from(distances)
    return samples
}

describe("liveCard", () => {
    it("держит дорогу закрытого круга, а линию — только открытого", () => {
        const closed = trace("l1", [0, 10, 20], [0, 5, 0], [0, 100, 200])
        const open = trace("l2", [0, 1], [0, 0.2], [0, 4])
        const card = liveCard(
            session(),
            [lap("l1", 1, 90_000), lap("l2", 2, null)],
            [closed, open]
        )

        expect(card.rows.map(row => row.lap.number)).toEqual([1, 2])
        expect(card.road?.lapId).toBe("l1")
        expect(card.line?.lapId).toBe("l2")
        expect(card.currentLap?.number).toBe(2)
    })

    it("берёт дорогой самый длинный закрытый круг", () => {
        const short = trace("l1", [0, 1], [0, 0], [0, 10])
        const full = trace("l2", [0, 50, 100], [0, 20, 0], [0, 1000, 2000])
        const card = liveCard(
            session(),
            [lap("l1", 1, 20_000), lap("l2", 2, 90_000), lap("l3", 3, null)],
            [short, full]
        )

        expect(card.road?.lapId).toBe("l2")
        expect(card.line).toBeUndefined()
    })
})
