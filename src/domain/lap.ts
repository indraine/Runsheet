export type Lap = {
    id: string
    sessionId: string
    /** 1-based lap number. */
    number: number
    /** Full lap time in ms. Null until the lap closes. */
    timeMs: number | null
    /** Sector times in ms. Null until that sector closes. */
    s1Ms: number | null
    s2Ms: number | null
    s3Ms: number | null
    /** Lap distance in metres where sector 1 ended. Null until the sector closes. */
    s1EndM: number | null
    /** Lap distance in metres where sector 2 ended. Null until the sector closes. */
    s2EndM: number | null
    /** `graphics.is_valid_lap` on the last sample before the lap closes. */
    valid: boolean
    /** Peak `physics.speed_kmh` on this lap. */
    maxSpeed: number
    /** Fuel left, litres, from `physics.fuel`. */
    fuel: number
}
