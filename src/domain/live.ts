import { fastestValidLap, withRealTimes, type Lap } from "~/domain/lap"
import type { Session } from "~/domain/session"
import type { Trace } from "~/domain/trace"

export type LiveLapRow = {
    lap: Lap
    deltaMs: number | null
    best: boolean
}

export type LiveCard = {
    session: Session
    trackLengthM: number | undefined
    bestLap: Lap | undefined
    currentLap: Lap | undefined
    sector: 1 | 2 | 3 | undefined
    pressurePsi: number | undefined
    rows: LiveLapRow[]
    road: Trace | undefined
    
    car: Trace | undefined
}

const SECTOR_KEYS = ["s1Ms", "s2Ms", "s3Ms"] as const


export const shownLive = (
    sessions: readonly Session[],
    sessionId?: string | null
): Session | undefined => {
    if (!sessionId) return undefined
    return sessions.find(
        session => session.id === sessionId && session.status === "live"
    )
}

export const liveCard = (
    session: Session,
    laps: readonly Lap[],
    traces: readonly Trace[]
): LiveCard => {
    const ordered = [...laps]
        .map(withRealTimes)
        .sort((left, right) => left.number - right.number)
    const byLap = new Map(traces.map(trace => [trace.lapId, trace]))
    const bestLap = fastestValidLap(ordered)
    const currentLap =
        session.status === "live"
            ? findLast(ordered, lap => lap.timeMs === null)
            : undefined
    const openTrace = currentLap ? byLap.get(currentLap.id) : undefined
    const road =
        fullestTrace(ordered, byLap, lap => lap.timeMs !== null) ??
        (openTrace && hasGround(openTrace) ? openTrace : undefined) ??
        fullestTrace(ordered, byLap, () => true)
    const car = openTrace && hasPoint(openTrace) ? openTrace : undefined
    const pressureTrace = pressureSource(currentLap, ordered, byLap)

    return {
        session,
        trackLengthM: trackLength(ordered, byLap),
        bestLap,
        currentLap,
        sector: currentLap ? sectorOf(currentLap) : undefined,
        pressurePsi: pressureTrace ? averagePressure(pressureTrace) : undefined,
        rows: ordered.map(lap => ({
            lap,
            deltaMs: deltaToBest(lap, bestLap),
            best: bestLap?.id === lap.id,
        })),
        road,
        car,
    }
}

const trackLength = (
    laps: readonly Lap[],
    byLap: ReadonlyMap<string, Trace>
): number | undefined => {
    for (const lap of laps) {
        if (lap.timeMs === null) continue
        const trace = byLap.get(lap.id)
        if (!trace || trace.distance.length < 2) continue
        const span = spanOf(trace.distance)
        if (span !== undefined) return span
    }
    return undefined
}

const spanOf = (samples: Float32Array): number | undefined => {
    let min = Infinity
    let max = -Infinity
    for (const sample of samples) {
        if (!Number.isFinite(sample)) continue
        if (sample < min) min = sample
        if (sample > max) max = sample
    }
    if (!Number.isFinite(min) || max <= min) return undefined
    return max - min
}

const sectorOf = (lap: Lap): 1 | 2 | 3 => {
    if (lap.s1Ms === null) return 1
    if (lap.s2Ms === null) return 2
    return 3
}

const deltaToBest = (lap: Lap, best: Lap | undefined): number | null => {
    if (!best || best.timeMs === null) return null
    if (lap.id === best.id) return 0
    if (lap.timeMs !== null) return lap.timeMs - best.timeMs

    let sum = 0
    let counted = false
    for (const key of SECTOR_KEYS) {
        const sector = lap[key]
        const reference = best[key]
        if (sector === null || reference === null) break
        sum += sector - reference
        counted = true
    }
    return counted ? sum : null
}

const pressureSource = (
    currentLap: Lap | undefined,
    laps: readonly Lap[],
    byLap: ReadonlyMap<string, Trace>
): Trace | undefined => {
    if (currentLap) {
        const own = byLap.get(currentLap.id)
        if (own && hasPressure(own)) return own
    }
    return lastTrace(laps, byLap, hasPressure)
}

const averagePressure = (trace: Trace): number | undefined => {
    const count = Math.min(
        trace.pressureFl.length,
        trace.pressureFr.length,
        trace.pressureRl.length,
        trace.pressureRr.length
    )
    if (count < 1) return undefined
    const index = count - 1
    const samples = [
        trace.pressureFl[index],
        trace.pressureFr[index],
        trace.pressureRl[index],
        trace.pressureRr[index],
    ]
    if (samples.some(sample => !Number.isFinite(sample))) return undefined
    return (samples[0] + samples[1] + samples[2] + samples[3]) / 4
}

const hasGround = (trace: Trace): boolean =>
    Math.min(trace.x.length, trace.z.length) >= 2

const hasPoint = (trace: Trace): boolean =>
    Math.min(trace.x.length, trace.z.length) >= 1

const fullestTrace = (
    laps: readonly Lap[],
    byLap: ReadonlyMap<string, Trace>,
    accept: (lap: Lap) => boolean
): Trace | undefined => {
    let best: Trace | undefined
    let bestSpan = -1
    for (const lap of laps) {
        if (!accept(lap)) continue
        const trace = byLap.get(lap.id)
        if (!trace || !hasGround(trace)) continue
        const span = spanOf(trace.distance) ?? 0
        if (span > bestSpan) {
            best = trace
            bestSpan = span
        }
    }
    return best
}

const hasPressure = (trace: Trace): boolean =>
    Math.min(
        trace.pressureFl.length,
        trace.pressureFr.length,
        trace.pressureRl.length,
        trace.pressureRr.length
    ) >= 1

const lastTrace = (
    laps: readonly Lap[],
    byLap: ReadonlyMap<string, Trace>,
    accept: (trace: Trace) => boolean
): Trace | undefined => {
    for (let index = laps.length - 1; index >= 0; index -= 1) {
        const trace = byLap.get(laps[index].id)
        if (trace && accept(trace)) return trace
    }
    return undefined
}

const findLast = (
    laps: readonly Lap[],
    accept: (lap: Lap) => boolean
): Lap | undefined => {
    for (let index = laps.length - 1; index >= 0; index -= 1) {
        if (accept(laps[index])) return laps[index]
    }
    return undefined
}
