export type TrackPoint = {
    x: number
    y: number
    wRight?: number
    wLeft?: number
}

export type PlanarPoint = {
    x: number
    y: number
}

export type TrackBoundaries = {
    center: PlanarPoint[]
    left: PlanarPoint[]
    right: PlanarPoint[]
}

export type Similarity = {
    mirror: boolean
    scale: number
    cos: number
    sin: number
    tx: number
    ty: number
}

export type TraceMatch =
    | { status: "pending" | "rejected"; locked: false }
    | { status: "matched"; locked: boolean; fit: Similarity }

export type Placement =
    | {
          track: string
          lapId: string
          samples: number
          status: "pending" | "rejected"
      }
    | {
          track: string
          lapId: string
          samples: number
          status: "matched"
          locked: boolean
          fit: Similarity
      }

const SAMPLE_COUNT = 180
const MIN_DRIVEN_M = 600
const MIN_FRACTION = 0.12
const REJECT_FRACTION = 0.7
const LOCK_FRACTION = 0.85
const MAX_RMS_M = 16
const RMS_GAP_M = 4
const MIN_SCALE = 0.85
const MAX_SCALE = 1.18
const PHASE_GAP = 10
const REFINE_EVERY = 48

type Candidate = Similarity & {
    shift: number
    rms: number
}

export const parseTrackCsv = (csv: string): TrackPoint[] => {
    const points: TrackPoint[] = []
    for (const line of csv.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const columns = trimmed.split(",")
        const x = Number(columns[0])
        const y = Number(columns[1])
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (columns.length < 4) {
            points.push({ x, y })
            continue
        }
        const wRight = Number(columns[2])
        const wLeft = Number(columns[3])
        if (!Number.isFinite(wRight) || !Number.isFinite(wLeft)) continue
        points.push({ x, y, wRight, wLeft })
    }
    return points
}

export const computeTrackBoundaries = (
    points: readonly TrackPoint[]
): TrackBoundaries => {
    const count = points.length
    const center: PlanarPoint[] = []
    const left: PlanarPoint[] = []
    const right: PlanarPoint[] = []
    let normalX = 0
    let normalY = 1

    for (let index = 0; index < count; index += 1) {
        const previous = points[(index - 1 + count) % count]
        const next = points[(index + 1) % count]
        const current = points[index]
        const tangentX = next.x - previous.x
        const tangentY = next.y - previous.y
        const length = Math.hypot(tangentX, tangentY)
        if (length > 1e-6) {
            normalX = -tangentY / length
            normalY = tangentX / length
        }
        const wLeft = current.wLeft ?? 0
        const wRight = current.wRight ?? 0
        center.push({ x: current.x, y: current.y })
        left.push({
            x: current.x + wLeft * normalX,
            y: current.y + wLeft * normalY,
        })
        right.push({
            x: current.x - wRight * normalX,
            y: current.y - wRight * normalY,
        })
    }

    return { center, left, right }
}

export const applySimilarity = (
    point: PlanarPoint,
    fit: Similarity
): PlanarPoint => {
    const x = point.x
    const y = fit.mirror ? -point.y : point.y
    return {
        x: fit.scale * (fit.cos * x - fit.sin * y) + fit.tx,
        y: fit.scale * (fit.sin * x + fit.cos * y) + fit.ty,
    }
}

/** Mean distance (m) from the placed points to the centre line. */
export const fitError = (
    center: readonly PlanarPoint[],
    driven: readonly PlanarPoint[],
    fit: Similarity,
    limit = 160
): number => {
    if (center.length < 2 || driven.length === 0) return Infinity
    const step = Math.max(1, Math.ceil(driven.length / limit))
    let sum = 0
    let count = 0
    for (let index = 0; index < driven.length; index += step) {
        const placed = applySimilarity(driven[index], fit)
        let best = Infinity
        for (const point of center) {
            const gap = (point.x - placed.x) ** 2 + (point.y - placed.y) ** 2
            if (gap < best) best = gap
        }
        sum += Math.sqrt(best)
        count += 1
    }
    return sum / count
}

export const matchTrace = (
    center: readonly PlanarPoint[],
    driven: readonly PlanarPoint[]
): TraceMatch => {
    const pending: TraceMatch = { status: "pending", locked: false }
    if (center.length < 3 || driven.length < 2) return pending

    const centerLength = pathLength(center, true)
    const drivenLength = pathLength(driven, false)
    if (centerLength < 1) return pending

    const needed = Math.max(MIN_DRIVEN_M, centerLength * MIN_FRACTION)
    if (drivenLength < needed) return pending

    const spacing = centerLength / SAMPLE_COUNT
    const endsGap = Math.hypot(
        driven[0].x - driven[driven.length - 1].x,
        driven[0].y - driven[driven.length - 1].y
    )
    const closedLap =
        drivenLength > centerLength * 0.9 &&
        drivenLength < centerLength * 1.2 &&
        endsGap < Math.max(80, centerLength * 0.02)
    const drivenCount = closedLap
        ? SAMPLE_COUNT
        : Math.min(
              SAMPLE_COUNT,
              Math.max(12, Math.round(drivenLength / spacing) + 1)
          )
    const centerSamples = resample(center, SAMPLE_COUNT, true)
    const drivenSamples = resample(driven, drivenCount, closedLap)
    const candidates: Candidate[] = []

    for (const mirror of [false, true]) {
        const source = mirror
            ? drivenSamples.map(point => ({ x: point.x, y: -point.y }))
            : drivenSamples
        for (let shift = 0; shift < SAMPLE_COUNT; shift += 1) {
            const fit = similarityBetween(
                source,
                window(centerSamples, shift, source.length)
            )
            if (!fit) continue
            if (fit.scale < MIN_SCALE || fit.scale > MAX_SCALE) continue
            candidates.push({ mirror, shift, ...fit })
        }
    }

    const coverage = drivenLength / centerLength
    const rejected: TraceMatch = { status: "rejected", locked: false }
    candidates.sort((left, right) => left.rms - right.rms)
    const best = candidates[0]
    if (!best || best.rms > MAX_RMS_M) {
        return coverage >= REJECT_FRACTION ? rejected : pending
    }

    const rival = candidates.find(item => farFrom(item, best))
    const unique = !rival || rival.rms - best.rms >= RMS_GAP_M
    if (!unique) return coverage >= REJECT_FRACTION ? rejected : pending

    return {
        status: "matched",
        locked: coverage >= LOCK_FRACTION,
        fit: {
            mirror: best.mirror,
            scale: best.scale,
            cos: best.cos,
            sin: best.sin,
            tx: best.tx,
            ty: best.ty,
        },
    }
}

export const placeOnTrack = (
    center: readonly PlanarPoint[],
    track: string,
    lapId: string,
    driven: readonly PlanarPoint[],
    previous?: Placement
): Placement => {
    if (
        previous &&
        shouldReusePlacement(previous, track, lapId, driven.length)
    ) {
        return previous
    }

    const match = matchTrace(center, driven)
    if (
        match.status === "pending" &&
        previous?.status === "matched" &&
        previous.track === track &&
        previous.lapId === lapId
    ) {
        return { ...previous, samples: driven.length }
    }

    if (match.status === "matched") {
        return {
            track,
            lapId,
            samples: driven.length,
            status: "matched",
            locked: match.locked,
            fit: match.fit,
        }
    }

    return {
        track,
        lapId,
        samples: driven.length,
        status: match.status,
    }
}

export const shouldReusePlacement = (
    previous: Placement | undefined,
    track: string,
    lapId: string,
    samples: number
): boolean => {
    if (!previous || previous.track !== track || previous.lapId !== lapId) {
        return false
    }
    if (previous.status === "rejected") return true
    if (previous.status === "matched" && previous.locked) return true
    return samples < previous.samples + REFINE_EVERY
}

const farFrom = (item: Candidate, best: Candidate): boolean => {
    if (item.mirror !== best.mirror) return true
    const delta = Math.abs(item.shift - best.shift)
    const phase = Math.min(delta, SAMPLE_COUNT - delta)
    return phase > PHASE_GAP
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

const resample = (
    points: readonly PlanarPoint[],
    count: number,
    closed: boolean
): PlanarPoint[] => {
    const sourceCount = points.length
    const segments = closed ? sourceCount : sourceCount - 1
    if (segments < 1 || count < 2) return []

    const lengths: number[] = []
    let total = 0
    for (let index = 0; index < segments; index += 1) {
        const next = points[(index + 1) % sourceCount]
        const current = points[index]
        const length = Math.hypot(next.x - current.x, next.y - current.y)
        lengths.push(length)
        total += length
    }
    if (total < 1e-6) return []

    const step = total / (closed ? count : count - 1)
    const sampled: PlanarPoint[] = []
    let segment = 0
    let walked = 0
    for (let index = 0; index < count; index += 1) {
        const target = index * step
        while (
            segment < segments - 1 &&
            walked + lengths[segment] < target - 1e-9
        ) {
            walked += lengths[segment]
            segment += 1
        }
        const span = lengths[segment]
        const ratio = span < 1e-9 ? 0 : Math.min(1, (target - walked) / span)
        const from = points[segment % sourceCount]
        const to = points[(segment + 1) % sourceCount]
        sampled.push({
            x: from.x + (to.x - from.x) * ratio,
            y: from.y + (to.y - from.y) * ratio,
        })
    }
    return sampled
}

const window = (
    points: readonly PlanarPoint[],
    start: number,
    count: number
): PlanarPoint[] => {
    const slice: PlanarPoint[] = []
    for (let index = 0; index < count; index += 1) {
        slice.push(points[(start + index) % points.length])
    }
    return slice
}

const similarityBetween = (
    source: readonly PlanarPoint[],
    target: readonly PlanarPoint[]
): Omit<Candidate, "mirror" | "shift"> | undefined => {
    const count = Math.min(source.length, target.length)
    if (count < 2) return undefined

    let sourceX = 0
    let sourceY = 0
    let targetX = 0
    let targetY = 0
    for (let index = 0; index < count; index += 1) {
        sourceX += source[index].x
        sourceY += source[index].y
        targetX += target[index].x
        targetY += target[index].y
    }
    sourceX /= count
    sourceY /= count
    targetX /= count
    targetY /= count

    let dot = 0
    let cross = 0
    let sourceVar = 0
    for (let index = 0; index < count; index += 1) {
        const sx = source[index].x - sourceX
        const sy = source[index].y - sourceY
        const dx = target[index].x - targetX
        const dy = target[index].y - targetY
        dot += sx * dx + sy * dy
        cross += sx * dy - sy * dx
        sourceVar += sx * sx + sy * sy
    }
    if (sourceVar < 1e-6) return undefined

    const magnitude = Math.hypot(dot, cross)
    const scale = magnitude / sourceVar
    const cos = magnitude > 1e-9 ? dot / magnitude : 1
    const sin = magnitude > 1e-9 ? cross / magnitude : 0
    const tx = targetX - scale * (cos * sourceX - sin * sourceY)
    const ty = targetY - scale * (sin * sourceX + cos * sourceY)

    let error = 0
    for (let index = 0; index < count; index += 1) {
        const x = source[index].x
        const y = source[index].y
        const projectedX = scale * (cos * x - sin * y) + tx
        const projectedY = scale * (sin * x + cos * y) + ty
        const dx = projectedX - target[index].x
        const dy = projectedY - target[index].y
        error += dx * dx + dy * dy
    }

    return { scale, cos, sin, tx, ty, rms: Math.sqrt(error / count) }
}
