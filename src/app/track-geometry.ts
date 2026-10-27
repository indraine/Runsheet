import type { PlanarPoint, TrackBoundaries } from "~/app/track-surface"

export type SectorId = 1 | 2 | 3

export type SectorCut = {
    distance: number
    left: PlanarPoint
    right: PlanarPoint
}

export type SectorLabel = {
    id: SectorId
    name: `S${SectorId}`
    at: PlanarPoint
}

export type SectorBand = {
    id: SectorId
    polygon: PlanarPoint[]
}

export type SectorLayout = {
    length: number
    cuts: readonly SectorCut[]
    labels: readonly SectorLabel[]
    bands: readonly SectorBand[]
}

/** Closed asphalt ribbon: left boundary forward, right boundary reversed. */
export const asphaltPolygon = (
    bounds: TrackBoundaries
): PlanarPoint[] => {
    const count = Math.min(bounds.left.length, bounds.right.length)
    if (count < 3) return []
    const ring: PlanarPoint[] = []
    for (let index = 0; index < count; index += 1) {
        ring.push(bounds.left[index])
    }
    for (let index = count - 1; index >= 0; index -= 1) {
        ring.push(bounds.right[index])
    }
    return ring
}

/** Asphalt ribbon for one distance span along the loop. */
export const ribbonBetween = (
    bounds: TrackBoundaries,
    fromM: number,
    toM: number,
    length: number
): PlanarPoint[] => {
    if (length < 1 || toM <= fromM) return []
    const span = toM - fromM
    const steps = Math.max(
        8,
        Math.ceil((span / length) * bounds.center.length)
    )
    const left: PlanarPoint[] = []
    const right: PlanarPoint[] = []
    for (let step = 0; step <= steps; step += 1) {
        const distance = fromM + (span * step) / steps
        const cut = cutAcross(
            bounds,
            distance >= length ? length - 1e-6 : distance,
            length
        )
        if (!cut) continue
        left.push(cut.left)
        right.push(cut.right)
    }
    if (left.length < 2) return []
    return [...left, ...right.reverse()]
}

export const closedLength = (points: readonly PlanarPoint[]): number =>
    pathLength(points, true)

/** Resolve S1/S2 ends; missing values fall back to equal thirds of the loop. */
export const resolveSectorEnds = (
    length: number,
    s1EndM?: number | null,
    s2EndM?: number | null
): { s1: number; s2: number } => {
    const third = length / 3
    const s1 =
        finiteInRange(s1EndM, length) !== undefined
            ? (s1EndM as number)
            : third
    const s2Raw = finiteInRange(s2EndM, length)
    const s2 =
        s2Raw !== undefined && s2Raw > s1
            ? s2Raw
            : Math.min(length, Math.max(s1 + third, (2 * length) / 3))
    return { s1, s2 }
}

export const sectorLayout = (
    bounds: TrackBoundaries,
    s1EndM?: number | null,
    s2EndM?: number | null
): SectorLayout | undefined => {
    const length = closedLength(bounds.center)
    if (length < 1 || bounds.center.length < 3) return undefined
    if (
        bounds.left.length < 3 ||
        bounds.right.length < 3 ||
        bounds.left.length !== bounds.center.length ||
        bounds.right.length !== bounds.center.length
    ) {
        return undefined
    }

    const { s1, s2 } = resolveSectorEnds(length, s1EndM, s2EndM)
    const cuts: SectorCut[] = []
    for (const distance of [0, s1, s2]) {
        const cut = cutAcross(bounds, distance, length)
        if (cut) cuts.push(cut)
    }
    if (cuts.length !== 3) return undefined

    const ranges: { id: SectorId; from: number; to: number }[] = [
        { id: 1, from: 0, to: s1 },
        { id: 2, from: s1, to: s2 },
        { id: 3, from: s2, to: length },
    ]
    const bands: SectorBand[] = []
    const labels: SectorLabel[] = []
    for (const range of ranges) {
        const polygon = ribbonBetween(bounds, range.from, range.to, length)
        if (polygon.length < 4) return undefined
        bands.push({ id: range.id, polygon })
        const sample = cutAcross(
            bounds,
            (range.from + range.to) / 2,
            length
        )
        if (!sample) return undefined
        labels.push({
            id: range.id,
            name: `S${range.id}`,
            at: {
                x: (sample.left.x + sample.right.x) / 2,
                y: (sample.left.y + sample.right.y) / 2,
            },
        })
    }

    return { length, cuts, labels, bands }
}

const cutAcross = (
    bounds: TrackBoundaries,
    distance: number,
    length: number
): SectorCut | undefined => {
    const located = locateClosed(bounds.center, distance, length)
    if (!located) return undefined
    const left = lerp(bounds.left, located.index, located.t)
    const right = lerp(bounds.right, located.index, located.t)
    if (!left || !right) return undefined
    return { distance, left, right }
}

const locateClosed = (
    points: readonly PlanarPoint[],
    distance: number,
    length: number
): { index: number; t: number } | undefined => {
    const count = points.length
    if (count < 2 || length < 1e-6) return undefined
    let target = ((distance % length) + length) % length
    if (target > length - 1e-6) target = 0

    let walked = 0
    for (let index = 0; index < count; index += 1) {
        const next = points[(index + 1) % count]
        const current = points[index]
        const span = Math.hypot(next.x - current.x, next.y - current.y)
        if (walked + span >= target - 1e-9 || index === count - 1) {
            const t = span < 1e-9 ? 0 : Math.min(1, (target - walked) / span)
            return { index, t }
        }
        walked += span
    }
    return { index: 0, t: 0 }
}

const lerp = (
    points: readonly PlanarPoint[],
    index: number,
    t: number
): PlanarPoint | undefined => {
    const from = points[index]
    const to = points[(index + 1) % points.length]
    if (!from || !to) return undefined
    return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
    }
}

const pathLength = (
    points: readonly PlanarPoint[],
    closed: boolean
): number => {
    const count = points.length
    if (count < 2) return 0
    const segments = closed ? count : count - 1
    let total = 0
    for (let index = 0; index < segments; index += 1) {
        const next = points[(index + 1) % count]
        const current = points[index]
        total += Math.hypot(next.x - current.x, next.y - current.y)
    }
    return total
}

const finiteInRange = (
    value: number | null | undefined,
    length: number
): number | undefined => {
    if (value == null || !Number.isFinite(value)) return undefined
    if (value <= 0 || value >= length) return undefined
    return value
}
