/**
 * Sample order of one lap. The Rust packer writes these as one little-endian
 * f32 plane, channel-major: every `distance` sample, then every `time` sample,
 * and so on. `time` is milliseconds from the start of this lap. `x` and `z`
 * are world ground coordinates. Channels stay plain arrays, not signals.
 */
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
] as const;

export type TraceChannel = (typeof TRACE_CHANNELS)[number];

/** One document per lap. Every channel has the same length. */
export type Trace = { lapId: string } & Record<TraceChannel, Float32Array>;
