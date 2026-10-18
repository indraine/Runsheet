import { fastestValidLap, type Lap } from "~/domain/lap"
import type { Session } from "~/domain/session"
import type { Trace } from "~/domain/trace"

/** Строка таблицы кругов живой сессии. */
export type LiveLapRow = {
    lap: Lap
    /** Разница с лучшим кругом, мс. Отрицательная — быстрее. */
    deltaMs: number | null
    /** Этот круг — лучший зачётный. */
    best: boolean
}

/** Верх таймлайна: одна живая сессия. */
export type LiveCard = {
    session: Session
    /**
     * Размах `distance` самого раннего завершённого круга, у которого есть трейс.
     * Пока такого круга нет, метры скрыты: открытый круг ещё не проехал всю трассу.
     */
    trackLengthM: number | undefined
    bestLap: Lap | undefined
    /** Круг, который ещё не закрыт. */
    currentLap: Lap | undefined
    /** 1–3, пока есть открытый круг. */
    sector: 1 | 2 | 3 | undefined
    /** Среднее четырёх давлений на последнем сэмпле, psi. */
    pressurePsi: number | undefined
    rows: LiveLapRow[]
    /** Последний круг, у которого есть земля `x`/`z`. */
    line: Trace | undefined
}

const SECTOR_KEYS = ["s1Ms", "s2Ms", "s3Ms"] as const

/**
 * Собирает карточку из сессии, её кругов и трейсов.
 * Круги приходят в любом порядке.
 */
export const liveCard = (
    session: Session,
    laps: readonly Lap[],
    traces: readonly Trace[]
): LiveCard => {
    const ordered = [...laps].sort((left, right) => left.number - right.number)
    const byLap = new Map(traces.map(trace => [trace.lapId, trace]))
    const bestLap = fastestValidLap(ordered)
    const currentLap = findLast(ordered, lap => lap.timeMs === null)
    const line = lastTrace(ordered, byLap, hasGround)
    const pressureTrace = pressureSource(currentLap, ordered, byLap)

    return {
        session,
        trackLengthM: trackLength(ordered, byLap),
        bestLap,
        currentLap,
        sector: currentLap ? sectorOf(currentLap) : undefined,
        pressurePsi: pressureTrace ? averagePressure(pressureTrace) : undefined,
        rows: ordered.map(lap => ({
            lap,
            deltaMs: deltaToBest(lap, bestLap),
            best: bestLap?.id === lap.id,
        })),
        line,
    }
}

const trackLength = (
    laps: readonly Lap[],
    byLap: ReadonlyMap<string, Trace>
): number | undefined => {
    for (const lap of laps) {
        if (lap.timeMs === null) continue
        const trace = byLap.get(lap.id)
        if (!trace || trace.distance.length < 2) continue
        const span = spanOf(trace.distance)
        if (span !== undefined) return span
    }
    return undefined
}

const spanOf = (samples: Float32Array): number | undefined => {
    let min = Infinity
    let max = -Infinity
    for (const sample of samples) {
        if (!Number.isFinite(sample)) continue
        if (sample < min) min = sample
        if (sample > max) max = sample
    }
    if (!Number.isFinite(min) || max <= min) return undefined
    return max - min
}

const sectorOf = (lap: Lap): 1 | 2 | 3 => {
    if (lap.s1Ms === null) return 1
    if (lap.s2Ms === null) return 2
    return 3
}

const deltaToBest = (lap: Lap, best: Lap | undefined): number | null => {
    if (!best || best.timeMs === null) return null
    if (lap.id === best.id) return 0
    if (lap.timeMs !== null) return lap.timeMs - best.timeMs

    let sum = 0
    let counted = false
    for (const key of SECTOR_KEYS) {
        const sector = lap[key]
        const reference = best[key]
        if (sector === null || reference === null) break
        sum += sector - reference
        counted = true
    }
    return counted ? sum : null
}

const pressureSource = (
    currentLap: Lap | undefined,
    laps: readonly Lap[],
    byLap: ReadonlyMap<string, Trace>
): Trace | undefined => {
    if (currentLap) {
        const own = byLap.get(currentLap.id)
        if (own && hasPressure(own)) return own
    }
    return lastTrace(laps, byLap, hasPressure)
}

const averagePressure = (trace: Trace): number | undefined => {
    const count = Math.min(
        trace.pressureFl.length,
        trace.pressureFr.length,
        trace.pressureRl.length,
        trace.pressureRr.length
    )
    if (count < 1) return undefined
    const index = count - 1
    const samples = [
        trace.pressureFl[index],
        trace.pressureFr[index],
        trace.pressureRl[index],
        trace.pressureRr[index],
    ]
    if (samples.some(sample => !Number.isFinite(sample))) return undefined
    return (samples[0] + samples[1] + samples[2] + samples[3]) / 4
}

const hasGround = (trace: Trace): boolean =>
    Math.min(trace.x.length, trace.z.length) >= 2

const hasPressure = (trace: Trace): boolean =>
    Math.min(
        trace.pressureFl.length,
        trace.pressureFr.length,
        trace.pressureRl.length,
        trace.pressureRr.length
    ) >= 1

const lastTrace = (
    laps: readonly Lap[],
    byLap: ReadonlyMap<string, Trace>,
    accept: (trace: Trace) => boolean
): Trace | undefined => {
    for (let index = laps.length - 1; index >= 0; index -= 1) {
        const trace = byLap.get(laps[index].id)
        if (trace && accept(trace)) return trace
    }
    return undefined
}

const findLast = (
    laps: readonly Lap[],
    accept: (lap: Lap) => boolean
): Lap | undefined => {
    for (let index = laps.length - 1; index >= 0; index -= 1) {
        if (accept(laps[index])) return laps[index]
    }
    return undefined
}
