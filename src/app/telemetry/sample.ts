import type { Trace } from "~/domain"

export type TraceSample = {
    distance: number
    throttle: number
    brake: number
    steer: number
    speed: number
    gear: number
    x: number
    z: number
    time: number
}

/** Inclusive distance span of a trace, or undefined when empty. */
export const distanceSpan = (
    trace: Trace | undefined
): { min: number; max: number } | undefined => {
    if (!trace || trace.distance.length < 1) return undefined
    let min = Infinity
    let max = -Infinity
    for (const sample of trace.distance) {
        if (!Number.isFinite(sample)) continue
        if (sample < min) min = sample
        if (sample > max) max = sample
    }
    if (!Number.isFinite(min) || max < min) return undefined
    return { min, max }
}

/**
 * Sample a lap at a distance, blending the two surrounding points.
 *
 * Continuous channels move with the cursor. Gear stays on the nearer
 * sample because it is a step signal.
 *
 * @example
 * ```ts
 * const point = sampleAtDistance(trace, 50)
 * point?.throttle // halfway when samples sit at 0 and 100
 * ```
 */
export const sampleAtDistance = (
    trace: Trace | undefined,
    distance: number
): TraceSample | undefined => {
    if (!trace || !Number.isFinite(distance) || trace.distance.length < 1) {
        return undefined
    }
    let previous = -1
    for (let index = 0; index < trace.distance.length; index += 1) {
        const at = trace.distance[index]
        if (!Number.isFinite(at)) continue
        if (at >= distance) {
            if (previous < 0 || at === distance) {
                return readSample(trace, index, index, 0)
            }
            const from = trace.distance[previous] ?? at
            const span = at - from
            const t = span > 0 ? (distance - from) / span : 0
            return readSample(trace, previous, index, t)
        }
        previous = index
    }
    if (previous < 0) return undefined
    return readSample(trace, previous, previous, 0)
}

const readSample = (
    trace: Trace,
    left: number,
    right: number,
    t: number
): TraceSample => {
    const mix = (
        channel:
            | "throttle"
            | "brake"
            | "steer"
            | "speed"
            | "x"
            | "z"
            | "time"
            | "distance"
    ) => {
        const start = trace[channel][left] ?? 0
        const end = trace[channel][right] ?? start
        const from = Number.isFinite(start) ? start : 0
        const to = Number.isFinite(end) ? end : from
        return from + (to - from) * t
    }
    const gearIndex = t >= 0.5 ? right : left
    return {
        distance: mix("distance"),
        throttle: mix("throttle"),
        brake: mix("brake"),
        steer: mix("steer"),
        speed: mix("speed"),
        gear: trace.gear[gearIndex] ?? 0,
        x: mix("x"),
        z: mix("z"),
        time: mix("time"),
    }
}

/**
 * Largest absolute steer in a lap, or `0` when the trace is missing.
 *
 * @example
 * ```ts
 * steerPeak(trace) // 1.2
 * ```
 */
export const steerPeak = (trace: Trace | undefined): number => {
    if (!trace) return 0
    let peak = 0
    for (const value of trace.steer) {
        if (!Number.isFinite(value)) continue
        const magnitude = Math.abs(value)
        if (magnitude > peak) peak = magnitude
    }
    return peak
}

/**
 * Peaks at or below this are ACC `steerAngle` in radians.
 * A GT3 wheel stays under ~4 rad at full lock; the seed lap is degrees
 * and peaks far above this.
 */
export const STEER_RADIAN_PEAK = 6

/**
 * Wheel rotation in degrees, clockwise positive (right).
 *
 * ACC stores `steerAngle` in radians, so a raw value of `1` is only one
 * degree on screen. Degree traces (peak above {@link STEER_RADIAN_PEAK})
 * are left unchanged.
 *
 * @example
 * ```ts
 * wheelRotationDeg(Math.PI / 2, 2) // 90
 * wheelRotationDeg(40, 110) // 40
 * ```
 */
export const wheelRotationDeg = (steer: number, peak: number): number => {
    if (!Number.isFinite(steer)) return 0
    if (Number.isFinite(peak) && peak > STEER_RADIAN_PEAK) return steer
    return (steer * 180) / Math.PI
}

/** Downsample columnar channels to at most `limit` points (keeps ends). */
export const downsampleIndices = (count: number, limit: number): number[] => {
    if (count <= 0) return []
    if (count <= limit) {
        return Array.from({ length: count }, (_, index) => index)
    }
    const indices: number[] = []
    for (let step = 0; step < limit; step += 1) {
        indices.push(Math.round((step * (count - 1)) / (limit - 1)))
    }
    return indices
}
