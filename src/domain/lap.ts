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
}


const MAX_LAP_MS = 2 * 60 * 60 * 1000

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

export function fastestValidLap(laps: readonly Lap[]): Lap | undefined {
    let best: Lap | undefined
    for (const lap of laps) {
        if (!lap.valid || lap.timeMs === null) continue
        if (!best || best.timeMs === null || lap.timeMs < best.timeMs) {
            best = lap
        }
    }
    return best
}
