export type PlotPoint = { x: number; y: number }

export type DeltaArea = {
    side: "slower" | "faster"
    polygon: number[]
}

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
