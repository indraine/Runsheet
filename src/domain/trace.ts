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
export function lapPointAt(
    trace: Trace,
    index: number
): LapPoint | undefined {
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
