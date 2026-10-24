export const FOLLOW_MIN_KMH = 15

export type MapView = "overview" | "follow"

/** В боксах и на малой скорости — вся карта. На ходу — за машиной. */
export const mapViewFor = (input: {
    canFollow: boolean
    inPit: boolean
    speedKmh: number | null
}): MapView => {
    if (!input.canFollow || input.inPit) return "overview"
    if (input.speedKmh == null || input.speedKmh < FOLLOW_MIN_KMH) {
        return "overview"
    }
    return "follow"
}
