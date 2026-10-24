export type MapView = "overview" | "follow"

/** В боксах — вся карта. На трассе — всегда за машиной. */
export const mapViewFor = (input: {
    canFollow: boolean
    inPit: boolean
}): MapView => (input.canFollow && !input.inPit ? "follow" : "overview")
