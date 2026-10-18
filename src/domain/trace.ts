/** Порядок каналов в плоскости пачки. Совпадает с упаковщиком в Rust. */
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

/**
 * Один документ на круг. Каналы одной длины и остаются обычными массивами.
 *
 * Пачка из Rust — little-endian, тот же порядок, что у упаковщика.
 * Сначала заголовок в 76 байт: `lapId` и `sessionId` по 16 байт, `number` i32,
 * число сэмплов u32, `timeMs` `s1Ms` `s2Ms` `s3Ms` как i32, `s1EndM` и
 * `s2EndM` как f32, `valid` u8 и три нуля, `fuel` и `maxSpeed` как f32.
 * Нет времени или границы сектора — `-1` / `-1.0`.
 * Дальше плоскость f32 по каналам, не по сэмплам: все `distance`, все `time`,
 * затем остальные `TRACE_CHANNELS`. `time` — миллисекунды от старта этого круга.
 * `x` и `z` — земля мировых координат.
 */
export type Trace = { lapId: string } & Record<TraceChannel, Float32Array>
