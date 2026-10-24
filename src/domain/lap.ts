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
