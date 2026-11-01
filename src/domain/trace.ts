export const TRACE_CHANNELS = [
    "distance",
    "time",
    "speed",
    "throttle",
    "brake",
    "steer",
    "gear",
    "gLong",
    "gLat",
    "x",
    "z",
    "pressureFl",
    "pressureFr",
    "pressureRl",
    "pressureRr",
    "brakeTempFl",
    "brakeTempFr",
    "rpm",
    "heading",
] as const

export type TraceChannel = (typeof TRACE_CHANNELS)[number]

/** Columnar lap telemetry stored in IndexedDB (`lap_telemetry`). */
export type Trace = { lapId: string } & Record<TraceChannel, Float32Array>

/**
 * One high-rate sample along a lap.
 *
 * ACC ground plane is `x`/`z` (world Y is vertical). `timestamp` is the
 * in-lap clock in milliseconds (`trace.time` on the wire).
 */
export type LapPoint = {
    distance: number
    x: number
    y: number
    speed: number
    throttle: number
    brake: number
    gear: number
    steer: number
    timestamp: number
}

/**
 * Read one {@link LapPoint} from a columnar {@link Trace}.
 *
 * @example
 * ```ts
 * const point = lapPointAt(trace, 0)
 * point?.gear // current gear at sample 0
 * ```
 */
export function lapPointAt(trace: Trace, index: number): LapPoint | undefined {
    if (index < 0 || index >= trace.distance.length) return undefined
    return {
        distance: trace.distance[index] ?? 0,
        x: trace.x[index] ?? 0,
        y: trace.z[index] ?? 0,
        speed: trace.speed[index] ?? 0,
        throttle: trace.throttle[index] ?? 0,
        brake: trace.brake[index] ?? 0,
        gear: trace.gear[index] ?? 0,
        steer: trace.steer[index] ?? 0,
        timestamp: trace.time[index] ?? 0,
    }
}

/** A lap whose ground track spans less than this has no usable trajectory. */
const MIN_TRAJECTORY_SPAN_M = 20

/**
 * Whether the lap carries a real ground track. Missing channels are stored
 * as zeros (imports without positions, old dumps), so a constant `x`/`z`
 * counts as no trajectory.
 *
 * @example
 * ```ts
 * hasTrajectory(trace) // false for a lap imported without positions
 * ```
 */
export function hasTrajectory(trace: Trace): boolean {
    const count = Math.min(trace.x.length, trace.z.length)
    if (count < 2) return false
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (let index = 0; index < count; index += 1) {
        const x = trace.x[index]
        const z = trace.z[index]
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (z < minZ) minZ = z
        if (z > maxZ) maxZ = z
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return false
    return Math.hypot(maxX - minX, maxZ - minZ) >= MIN_TRAJECTORY_SPAN_M
}
