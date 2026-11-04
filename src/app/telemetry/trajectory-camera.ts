export const FOLLOW_REACH_M = 80

export const followScale = (
    radiusPx: number,
    width: number,
    height: number,
    fill = 0.34
): number => {
    if (width < 16 || height < 16) return 1
    const radius = Math.max(radiusPx, 12)
    return (Math.max(width, height) * fill) / radius
}

export const windowRadius = (
    points: readonly { x: number; y: number; distance: number }[],
    cursor: number,
    reachM: number,
    origin: { x: number; y: number }
): number => {
    let radius = 0
    let count = 0
    for (const point of points) {
        if (!Number.isFinite(point.distance)) continue
        if (Math.abs(point.distance - cursor) > reachM) continue
        count += 1
        const span = Math.hypot(point.x - origin.x, point.y - origin.y)
        if (span > radius) radius = span
    }
    return count < 2 ? 0 : radius
}
