import { downsampleIndices } from "~/app/telemetry/sample"
import {
    fitError,
    placeOnTrack,
    type Placement,
    type PlanarPoint,
    type Similarity,
} from "~/app/track-surface"
import type { Trace } from "~/domain"

export const MAX_FIT_POINTS = 900
export const MIN_FIT_SPEED_KMH = 20

/** The part of a lap line the fit needs. */
export type FitLine = { id: string; trace: Trace }

export type FitChoice = { signature: Placement[]; similarity?: Similarity }

/** Baseline first, then the other laps: any of them can anchor the asphalt. */
export const orderedForFit = <T extends FitLine>(
    lines: readonly T[],
    primary: T | undefined
): T[] => (primary ? [primary, ...lines.filter(line => line !== primary)] : [])

/**
 * Fit the asphalt to the laps of the comparison. Every lap that matches the
 * centre line is a candidate; the one that keeps all the compared laps
 * closest to the centre line wins, so a lap with a pit-lane start or a noisy
 * line cannot pull the asphalt away from the others. A lap that cannot be
 * matched no longer hides the asphalt for the whole comparison.
 */
export const resolveFit = (
    center: readonly PlanarPoint[] | undefined,
    track: string | undefined,
    candidates: readonly FitLine[],
    placements: Map<string, Placement>,
    chosen: FitChoice
): { similarity?: Similarity } => {
    if (!center || !track || candidates.length === 0) return {}
    const driven = candidates.map(line => tracePlanar(line.trace))
    const settled = candidates.map((line, index) => {
        const key = `${track}:${line.id}`
        const next = placeOnTrack(
            center,
            track,
            line.id,
            driven[index],
            placements.get(key)
        )
        placements.set(key, next)
        return next
    })
    if (
        chosen.signature.length === settled.length &&
        settled.every((item, index) => item === chosen.signature[index])
    ) {
        return { similarity: chosen.similarity }
    }
    let best: { fit: Similarity; error: number; locked: boolean } | undefined
    settled.forEach(next => {
        if (next.status !== "matched") return
        const errors = driven.map(points => fitError(center, points, next.fit))
        const error =
            errors.reduce((sum, value) => sum + value, 0) / errors.length
        const better =
            !best ||
            (next.locked && !best.locked) ||
            (next.locked === best.locked && error < best.error)
        if (better) best = { fit: next.fit, error, locked: next.locked }
    })
    chosen.signature = settled
    chosen.similarity = best?.fit
    return best ? { similarity: best.fit } : {}
}

export const tracePlanar = (trace: Trace): PlanarPoint[] => {
    const count = Math.min(trace.x.length, trace.z.length)
    const moving: PlanarPoint[] = []
    for (let index = 0; index < count; index += 1) {
        const x = trace.x[index]
        const y = trace.z[index]
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        // Standing in the box or crawling in the pit lane is not the racing line.
        if ((trace.speed[index] ?? Infinity) < MIN_FIT_SPEED_KMH) continue
        moving.push({ x, y })
    }
    return downsampleIndices(moving.length, MAX_FIT_POINTS).map(
        index => moving[index]
    )
}
