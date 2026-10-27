/** Metres of track kept in view on either side of the cursor. */
export const FOLLOW_REACH_M = 80

/**
 * Zoom that makes `radiusPx` fill `fill` of the longer viewport side.
 *
 * The track is already fitted into the panel, so this is the extra scale
 * that turns the whole lap into a close view around the car.
 *
 * @example
 * ```ts
 * followScale(40, 640, 280) // the 40px radius grows to about a third of 640
 * ```
 */
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

/**
 * Pixel distance from `origin` to the farthest sample within `reachM`.
 *
 * Returns `0` when the cursor has fewer than two neighbours, so the caller
 * can keep a fallback zoom.
 *
 * @example
 * ```ts
 * windowRadius(
 *   [{ x: 0, y: 0, distance: 0 }, { x: 100, y: 0, distance: 50 }],
 *   0,
 *   80,
 *   { x: 0, y: 0 }
 * ) // 100
 * ```
 */
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
