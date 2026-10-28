import type { Graphics } from "pixi.js"
import type { GroundPoint } from "~/app/fit-ground"

/** Approximate GT3 length used to size the marker against the track. */
export const CAR_LENGTH_M = 4.6

const MIN_LENGTH_PX = 12
const MAX_LENGTH_PX = 56
/** Local design length of {@link drawCarIcon} (nose → tail). */
const ICON_LEN = 10

/**
 * Screen length of the car icon from track metres×fit×zoom.
 *
 * @example
 * carScreenLength(0.2, 10) // 4.6 * 0.2 * 10 = 9.2 → clamped to 12
 */
export const carScreenLength = (pixelsPerMeter: number, zoom: number): number => {
    const raw = CAR_LENGTH_M * pixelsPerMeter * zoom
    if (!Number.isFinite(raw) || raw <= 0) return MIN_LENGTH_PX
    return Math.min(MAX_LENGTH_PX, Math.max(MIN_LENGTH_PX, raw))
}

/**
 * Heading on screen for a distance-parameterized polyline.
 * 0 = up (−Y), +π/2 = right (+X) — matches Pixi rotation for a nose-up icon.
 *
 * @example
 * pathHeading([{x:0,y:10},{x:0,y:0}], [0, 10], 5) // ≈ 0 (up)
 */
export const pathHeading = (
    points: readonly GroundPoint[],
    distances: readonly number[],
    atM: number
): number | undefined => {
    const count = Math.min(points.length, distances.length)
    if (count < 2) return undefined

    let index = 0
    while (index < count - 1 && (distances[index + 1] ?? 0) < atM) {
        index += 1
    }

    let lo = index
    let hi = Math.min(index + 1, count - 1)
    for (;;) {
        const a = points[lo]
        const b = points[hi]
        if (!a || !b) return undefined
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (dx * dx + dy * dy > 1e-4) return Math.atan2(dx, -dy)
        if (hi < count - 1) hi += 1
        else if (lo > 0) lo -= 1
        else return undefined
    }
}

type CarLocal = { f: number; r: number }

/**
 * Simple top-down car icon; +f is forward (nose), sized by lengthPx.
 */
export const drawCarIcon = (
    graphics: Graphics,
    x: number,
    y: number,
    heading: number,
    lengthPx: number,
    fill: number,
    outline: number
) => {
    const s = lengthPx / ICON_LEN
    const noseX = Math.sin(heading)
    const noseY = -Math.cos(heading)
    const sideX = Math.cos(heading)
    const sideY = Math.sin(heading)
    const at = (point: CarLocal): { x: number; y: number } => ({
        x: x + (point.f * noseX + point.r * sideX) * s,
        y: y + (point.f * noseY + point.r * sideY) * s,
    })
    const poly = (points: readonly CarLocal[], color: number, alpha = 1) => {
        const first = at(points[0]!)
        graphics.moveTo(first.x, first.y)
        for (let i = 1; i < points.length; i += 1) {
            const next = at(points[i]!)
            graphics.lineTo(next.x, next.y)
        }
        graphics.closePath()
        graphics.fill({ color, alpha })
    }

    const tyre = (f: number, r: number) =>
        poly(
            [
                { f: f + 1.15, r: r - 0.55 },
                { f: f + 1.15, r: r + 0.55 },
                { f: f - 1.15, r: r + 0.55 },
                { f: f - 1.15, r: r - 0.55 },
            ],
            outline,
            0.95
        )

    poly(
        [
            { f: 5, r: 0 },
            { f: 2.2, r: 1.6 },
            { f: 2.2, r: -1.6 },
        ],
        fill
    )
    poly(
        [
            { f: 2.4, r: -1.7 },
            { f: 2.4, r: 1.7 },
            { f: -4.2, r: 1.7 },
            { f: -4.2, r: -1.7 },
        ],
        fill
    )
    poly(
        [
            { f: 0.8, r: -0.7 },
            { f: 0.8, r: 0.7 },
            { f: -1.6, r: 0.75 },
            { f: -1.6, r: -0.75 },
        ],
        outline,
        0.45
    )
    tyre(2.6, 2.55)
    tyre(2.6, -2.55)
    tyre(-2.8, 2.55)
    tyre(-2.8, -2.55)
}
