export const TRACE_CHANNELS = [
    "distance",
    "time",
    "speed",
    "throttle",
    "brake",
    "steer",
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

export type Trace = { lapId: string } & Record<TraceChannel, Float32Array>
