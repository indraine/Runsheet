export type GroundPoint = {
    x: number
    y: number
}

export type GroundSeries = {
    x: ArrayLike<number>
    z: ArrayLike<number>
}

export const fitFrame = (
    series: readonly GroundSeries[],
    width: number,
    height: number,
    padding: number,
    frame: readonly GroundSeries[] = series
): GroundPoint[][] => {
    if (width <= padding * 2 || height <= padding * 2) {
        return series.map(() => [])
    }

    const raw = series.map(item => collect(item.x, item.z))
    const bounds =
        frame === series ? raw : frame.map(item => collect(item.x, item.z))
    const scale = pixelsPerMeter(bounds, width, height, padding)
    if (scale === 0) return series.map(() => [])
    const span = spanOf(bounds)
    if (!span) return series.map(() => [])
    const offsetX = (width - span.x * scale) / 2
    const offsetY = (height - span.y * scale) / 2

    return raw.map(points =>
        points.map(point => ({
            x: offsetX + (point.x - span.minX) * scale,
            y: offsetY + (point.y - span.minY) * scale,
        }))
    )
}

const FOLLOW_CAR_Y = 0.68

const HEADING_M = 4

export const followFrame = (
    series: readonly GroundSeries[],
    width: number,
    height: number,
    aheadM: number
): GroundPoint[][] | undefined => {
    if (width < 2 || height < 2 || aheadM <= 0 || series.length === 0) {
        return undefined
    }

    const raw = series.map(item => collect(item.x, item.z))
    const trail = raw[raw.length - 1]
    const tip = trail?.[trail.length - 1]
    const turn = tip ? travelTurn(trail) : undefined
    if (!tip || turn === undefined) return undefined

    const scale = followPixelsPerMeter(height, aheadM)
    if (scale === 0) return undefined
    const anchorX = width / 2
    const anchorY = height * FOLLOW_CAR_Y
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)

    return raw.map(points =>
        points.map(point => {
            const dx = point.x - tip.x
            const dy = point.y - tip.y
            return {
                x: anchorX + (cos * dx - sin * dy) * scale,
                y: anchorY + (sin * dx + cos * dy) * scale,
            }
        })
    )
}

const travelTurn = (trail: readonly GroundPoint[]): number | undefined => {
    const tip = trail[trail.length - 1]
    if (!tip) return undefined

    for (let index = trail.length - 2; index >= 0; index -= 1) {
        const previous = trail[index]
        if (!previous) continue
        const dx = tip.x - previous.x
        const dy = tip.y - previous.y
        const length = Math.hypot(dx, dy)
        if (length < HEADING_M && index > 0) continue
        if (length < 1e-3) return undefined
        return -Math.PI / 2 - Math.atan2(dy, dx)
    }
    return undefined
}

export const fitPixelsPerMeter = (
    frame: readonly GroundSeries[],
    width: number,
    height: number,
    padding: number
): number =>
    pixelsPerMeter(
        frame.map(item => collect(item.x, item.z)),
        width,
        height,
        padding
    )

export const followPixelsPerMeter = (
    height: number,
    aheadM: number
): number => {
    if (height < 2 || aheadM <= 0) return 0
    return Math.max(height * FOLLOW_CAR_Y, 1) / aheadM
}

const pixelsPerMeter = (
    bounds: readonly GroundPoint[][],
    width: number,
    height: number,
    padding: number
): number => {
    if (width <= padding * 2 || height <= padding * 2) return 0
    const span = spanOf(bounds)
    if (!span) return 0
    return Math.min(
        (width - padding * 2) / span.x,
        (height - padding * 2) / span.y
    )
}

const spanOf = (
    bounds: readonly GroundPoint[][]
): { minX: number; minY: number; x: number; y: number } | undefined => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const points of bounds) {
        for (const point of points) {
            if (point.x < minX) minX = point.x
            if (point.x > maxX) maxX = point.x
            if (point.y < minY) minY = point.y
            if (point.y > maxY) maxY = point.y
        }
    }
    if (!Number.isFinite(minX)) return undefined
    return {
        minX,
        minY,
        x: Math.max(maxX - minX, 1e-6),
        y: Math.max(maxY - minY, 1e-6),
    }
}

const collect = (x: ArrayLike<number>, z: ArrayLike<number>): GroundPoint[] => {
    const count = Math.min(x.length, z.length)
    const raw: GroundPoint[] = []
    for (let index = 0; index < count; index += 1) {
        const pointX = x[index]
        const pointY = -z[index]
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) continue
        raw.push({ x: pointX, y: pointY })
    }
    return raw
}
