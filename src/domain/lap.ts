export type Lap = {
    id: string
    sessionId: string
    number: number
    timeMs: number | null
    s1Ms: number | null
    s2Ms: number | null
    s3Ms: number | null
    s1EndM: number | null
    s2EndM: number | null
    valid: boolean
    maxSpeed: number
    fuel: number
    /** Traction control level from the graphics page. */
    tc: number
    /** ABS level from the graphics page. */
    abs: number
    /** Engine map from the graphics page. */
    engineMap: number
    /** Front brake bias, fraction 0..1. */
    brakeBias: number
}

/** Rows written before electronics existed still load. */
export const completeLap = (lap: Lap): Lap => ({
    ...lap,
    tc: Number.isFinite(lap.tc) ? lap.tc : 0,
    abs: Number.isFinite(lap.abs) ? lap.abs : 0,
    engineMap: Number.isFinite(lap.engineMap) ? lap.engineMap : 0,
    brakeBias: Number.isFinite(lap.brakeBias) ? lap.brakeBias : 0,
})


const MAX_LAP_MS = 2 * 60 * 60 * 1000

/** Minimum max speed for a lap to be considered real driving.
 *
 * ACC reports near-zero speed when the car is in the menu, in the pitlane
 * before moving, or when the game is closed mid-lap. A real lap on any
 * track quickly exceeds this. */
export const MIN_MEANINGFUL_LAP_SPEED_KMH = 5

/** Minimum fuel recorded on a lap to treat it as real driving.
 *
 * Menu/pit artifacts often report exactly zero fuel, while a car that has
 * left the pits always carries some fuel. */
export const MIN_MEANINGFUL_LAP_FUEL_L = 0.1

export const realTimeMs = (ms: number | null | undefined): number | null => {
    if (ms == null || !Number.isFinite(ms) || ms <= 0 || ms > MAX_LAP_MS) {
        return null
    }
    return ms
}


export const withRealTimes = (lap: Lap): Lap => {
    const timeMs = realTimeMs(lap.timeMs)
    const s1Ms = realTimeMs(lap.s1Ms)
    let s2Ms = realTimeMs(lap.s2Ms)
    if (
        timeMs != null &&
        s1Ms != null &&
        s2Ms != null &&
        s2Ms > s1Ms &&
        s1Ms + s2Ms > timeMs
    ) {
        s2Ms = realTimeMs(s2Ms - s1Ms)
    }
    const stored = realTimeMs(lap.s3Ms)
    const repaired =
        stored ??
        (timeMs != null && s1Ms != null && s2Ms != null
            ? realTimeMs(timeMs - s1Ms - s2Ms)
            : null)
    return { ...lap, timeMs, s1Ms, s2Ms, s3Ms: repaired }
}

/** A lap that has actually driven on the track.
 *
 * Filters out menu artifacts, unstarted pit-lap records, and laps left
 * behind when the game is closed. */
export const isMeaningfulLap = (lap: Lap): boolean => {
    if (!lap.valid) return false
    if (!Number.isFinite(lap.maxSpeed)) return false
    if (lap.maxSpeed < MIN_MEANINGFUL_LAP_SPEED_KMH) return false
    if (lap.fuel < MIN_MEANINGFUL_LAP_FUEL_L) return false
    return true
}

export function fastestValidLap(laps: readonly Lap[]): Lap | undefined {
    let best: Lap | undefined
    for (const lap of laps) {
        if (!isMeaningfulLap(lap) || lap.timeMs === null) continue
        if (!best || best.timeMs === null || lap.timeMs < best.timeMs) {
            best = lap
        }
    }
    return best
}
