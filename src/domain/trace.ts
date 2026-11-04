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

export type Trace = { lapId: string } & Record<TraceChannel, Float32Array>

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

const MIN_TRAJECTORY_SPAN_M = 20

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
