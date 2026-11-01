export type PlotPoint = { x: number; y: number }

/** A closed area between a delta curve and the zero line. */
export type DeltaArea = {
    /** `slower` lies above zero (the lap is behind the baseline). */
    side: "slower" | "faster"
    /** Flat `[x0, y0, x1, y1, …]` polygon, ready for `Graphics.poly`. */
    polygon: number[]
}

/**
 * Split a delta curve into areas between it and the zero line.
 *
 * Screen `y` grows downwards, so a point above `zeroY` is a lap behind the
 * baseline. Where the curve crosses zero the area is cut at the crossing,
 * so the two colors never overlap.
 *
 * @example
 * ```ts
 * deltaAreas([{ x: 0, y: 10 }, { x: 10, y: 30 }], 20)
 * // two triangles: "slower" on the left, "faster" on the right
 * ```
 */
export const deltaAreas = (
    points: readonly PlotPoint[],
    zeroY: number
): DeltaArea[] => {
    const areas: DeltaArea[] = []
    if (points.length < 2) return areas

    let run: PlotPoint[] = []
    let side = 0

    const flush = () => {
        if (run.length >= 2 && side !== 0) {
            const polygon: number[] = []
            for (const point of run) polygon.push(point.x, point.y)
            const first = run[0]
            const last = run[run.length - 1]
            polygon.push(last.x, zeroY, first.x, zeroY)
            areas.push({ side: side > 0 ? "slower" : "faster", polygon })
        }
        run = []
    }

    for (const point of points) {
        const sign = Math.sign(zeroY - point.y)
        const previous = run[run.length - 1]
        if (!previous) {
            run = [point]
            side = sign
            continue
        }
        if (sign !== 0 && side !== 0 && sign !== side) {
            const t = (zeroY - previous.y) / (point.y - previous.y)
            const crossing = {
                x: previous.x + (point.x - previous.x) * t,
                y: zeroY,
            }
            run.push(crossing)
            flush()
            run = [crossing, point]
            side = sign
            continue
        }
        if (side === 0) side = sign
        run.push(point)
    }
    flush()
    return areas
}
