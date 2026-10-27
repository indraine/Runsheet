import {
    distanceSpan,
    sampleAtDistance,
    steerPeak,
} from "~/app/telemetry/sample"
import type { Trace } from "~/domain"

/** Which channel pulls the two laps apart the most inside a stretch. */
export type DivergenceCause = "brake" | "throttle" | "steer" | "speed"

/** A stretch of the lap where the two traces pull apart. */
export type DivergenceZone = {
    startM: number
    endM: number
    /** Peak normalized disagreement inside the stretch, roughly 0..1. */
    peak: number
    cause: DivergenceCause
}

type Stretch = {
    startM: number
    endM: number
    peak: number
    peakM: number
}

export type DistanceWindow = {
    min: number
    max: number
}

const STEP_M = 5
const SMOOTH_RADIUS_M = 18
const ENTER = 0.09
const EXIT = 0.055
const MIN_WIDTH_M = 18
const MERGE_GAP_M = 120
const MAX_FRACTION = 0.72
const MAX_ZONES = 12
const MIN_WINDOW_M = 48
const PAD_MIN_M = 16
const PAD_MAX_M = 40
const PAD_FRACTION = 0.2

/**
 * Stretches where throttle, brake, steer, or speed disagree.
 *
 * A chicane stays one stretch: nearby peaks are merged. A difference that
 * covers most of the lap is dropped — it is not a section you can open.
 *
 * @example
 * ```ts
 * const zones = divergenceZones(primary, reference)
 * zones[0]?.startM // metres where the laps first pull apart
 * ```
 */
export const divergenceZones = (
    primary: Trace | undefined,
    reference: Trace | undefined
): DivergenceZone[] => {
    if (!primary || !reference) return []
    const overlap = overlapSpan(primary, reference)
    if (!overlap) return []
    const length = overlap.max - overlap.min
    if (length < MIN_WIDTH_M) return []

    const count = Math.floor(length / STEP_M) + 1
    if (count < 4) return []

    const steerScale = Math.max(steerPeak(primary), steerPeak(reference), 1e-3)
    const speedScale = Math.max(speedPeak(primary), speedPeak(reference), 1)
    const scores = new Float64Array(count)
    for (let index = 0; index < count; index += 1) {
        const distance = overlap.min + index * STEP_M
        const left = sampleAtDistance(primary, distance)
        const right = sampleAtDistance(reference, distance)
        if (!left || !right) continue
        scores[index] = disagreement(left, right, steerScale, speedScale)
    }

    const radius = Math.max(1, Math.round(SMOOTH_RADIUS_M / STEP_M))
    const smooth = boxSmooth(scores, radius)
    const merged = mergeZones(thresholdZones(smooth, overlap.min), MERGE_GAP_M)
    const trimmed = merged.filter(zone => {
        const width = zone.endM - zone.startM
        return width >= MIN_WIDTH_M && width <= length * MAX_FRACTION
    })
    trimmed.sort((left, right) => right.peak - left.peak)
    const kept = trimmed.slice(0, MAX_ZONES)
    kept.sort((left, right) => left.startM - right.startM)
    return kept.map(zone => ({
        startM: zone.startM,
        endM: zone.endM,
        peak: zone.peak,
        cause: causeFor(primary, reference, zone, steerScale, speedScale),
    }))
}

/**
 * Window around a zone with entry and exit still in frame.
 *
 * The window is widened so the same chart width covers tens of metres
 * instead of the whole lap, and the cursor moves through the corner finely.
 *
 * @example
 * ```ts
 * zoneWindow(
 *   { startM: 200, endM: 260, peak: 0.4, cause: "brake" },
 *   { min: 0, max: 1000 }
 * )
 * // { min: 184, max: 276 }
 * ```
 */
export const zoneWindow = (
    zone: DivergenceZone,
    span: DistanceWindow
): DistanceWindow => {
    const width = Math.max(0, zone.endM - zone.startM)
    const pad = clamp(width * PAD_FRACTION, PAD_MIN_M, PAD_MAX_M)
    let min = zone.startM - pad
    let max = zone.endM + pad
    if (max - min < MIN_WINDOW_M) {
        const extra = (MIN_WINDOW_M - (max - min)) / 2
        min -= extra
        max += extra
    }
    if (min < span.min) {
        max += span.min - min
        min = span.min
    }
    if (max > span.max) {
        min -= max - span.max
        max = span.max
    }
    min = Math.max(span.min, min)
    max = Math.min(span.max, max)
    if (max <= min) return { min: span.min, max: span.max }
    return { min, max }
}

const overlapSpan = (
    primary: Trace,
    reference: Trace
): DistanceWindow | undefined => {
    const left = distanceSpan(primary)
    const right = distanceSpan(reference)
    if (!left || !right) return undefined
    const min = Math.max(left.min, right.min)
    const max = Math.min(left.max, right.max)
    if (max <= min) return undefined
    return { min, max }
}

const speedPeak = (trace: Trace): number => {
    let peak = 0
    for (const value of trace.speed) {
        if (!Number.isFinite(value)) continue
        const magnitude = Math.abs(value)
        if (magnitude > peak) peak = magnitude
    }
    return peak
}

const WEIGHT = {
    brake: 0.32,
    throttle: 0.32,
    steer: 0.22,
    speed: 0.14,
} as const

const disagreement = (
    left: { throttle: number; brake: number; steer: number; speed: number },
    right: { throttle: number; brake: number; steer: number; speed: number },
    steerScale: number,
    speedScale: number
): number => {
    const parts = channelParts(left, right, steerScale, speedScale)
    return parts.brake + parts.throttle + parts.steer + parts.speed
}

const channelParts = (
    left: { throttle: number; brake: number; steer: number; speed: number },
    right: { throttle: number; brake: number; steer: number; speed: number },
    steerScale: number,
    speedScale: number
): Record<DivergenceCause, number> => ({
    brake: WEIGHT.brake * Math.abs(left.brake - right.brake),
    throttle: WEIGHT.throttle * Math.abs(left.throttle - right.throttle),
    steer:
        WEIGHT.steer *
        clamp(Math.abs(left.steer - right.steer) / steerScale, 0, 1),
    speed:
        WEIGHT.speed *
        clamp(Math.abs(left.speed - right.speed) / speedScale, 0, 1),
})

const causeFor = (
    primary: Trace,
    reference: Trace,
    zone: Stretch,
    steerScale: number,
    speedScale: number
): DivergenceCause => {
    const parts: Record<DivergenceCause, number> = {
        brake: 0,
        throttle: 0,
        steer: 0,
        speed: 0,
    }
    const steps = 8
    for (let step = 0; step <= steps; step += 1) {
        const distance =
            zone.startM + ((zone.endM - zone.startM) * step) / steps
        const left = sampleAtDistance(primary, distance)
        const right = sampleAtDistance(reference, distance)
        if (!left || !right) continue
        const next = channelParts(left, right, steerScale, speedScale)
        parts.brake += next.brake
        parts.throttle += next.throttle
        parts.steer += next.steer
        parts.speed += next.speed
    }
    if (
        parts.brake > 0 &&
        parts.brake >= parts.throttle * 0.6 &&
        parts.brake >= parts.steer &&
        parts.brake >= parts.speed
    ) {
        return "brake"
    }
    let best: DivergenceCause = "steer"
    for (const key of ["throttle", "steer", "speed"] as const) {
        if (parts[key] > parts[best]) best = key
    }
    return best
}

const boxSmooth = (values: Float64Array, radius: number): Float64Array => {
    const smoothed = new Float64Array(values.length)
    for (let index = 0; index < values.length; index += 1) {
        const from = Math.max(0, index - radius)
        const to = Math.min(values.length - 1, index + radius)
        let sum = 0
        for (let cursor = from; cursor <= to; cursor += 1) sum += values[cursor]
        smoothed[index] = sum / (to - from + 1)
    }
    return smoothed
}

const thresholdZones = (scores: Float64Array, origin: number): Stretch[] => {
    const zones: Stretch[] = []
    let active: Stretch | undefined
    for (let index = 0; index < scores.length; index += 1) {
        const score = scores[index] ?? 0
        const distance = origin + index * STEP_M
        if (!active) {
            if (score >= ENTER) {
                active = {
                    startM: distance,
                    endM: distance,
                    peak: score,
                    peakM: distance,
                }
            }
            continue
        }
        if (score > active.peak) {
            active.peak = score
            active.peakM = distance
        }
        if (score >= EXIT) {
            active.endM = distance
            continue
        }
        zones.push(active)
        active =
            score >= ENTER
                ? {
                      startM: distance,
                      endM: distance,
                      peak: score,
                      peakM: distance,
                  }
                : undefined
    }
    if (active) zones.push(active)
    return zones
}

const mergeZones = (zones: readonly Stretch[], gap: number): Stretch[] => {
    if (zones.length === 0) return []
    const sorted = [...zones].sort((left, right) => left.startM - right.startM)
    const merged: Stretch[] = [{ ...sorted[0]! }]
    for (let index = 1; index < sorted.length; index += 1) {
        const current = merged[merged.length - 1]
        const next = sorted[index]
        if (!current || !next) continue
        if (next.startM - current.endM <= gap) {
            current.endM = Math.max(current.endM, next.endM)
            if (next.peak > current.peak) {
                current.peak = next.peak
                current.peakM = next.peakM
            }
            continue
        }
        merged.push({ ...next })
    }
    return merged
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))
