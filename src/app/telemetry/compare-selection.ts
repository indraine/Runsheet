const COMPARE_KEY = "runsheet.telemetry-compare"
export const MAX_COMPARE_LAPS = 4

export type StoredComparison = {
    lapIds: string[]
}

export type CompareLap = {
    id: string
    track: string
}

export type SessionLapRef = {
    id: string
    sessionId: string
    valid: boolean
    timeMs: number | null
}

export const parseStoredComparison = (
    raw: string | null
): StoredComparison | undefined => {
    if (!raw) return undefined
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return undefined
    }
    if (!isRecord(value)) return undefined
    const fromList = parseLapIds(value.lapIds)
    if (fromList) return { lapIds: fromList }
    const primaryId = value.primaryId
    if (typeof primaryId !== "string" || primaryId === "") return undefined
    const ids = [primaryId]
    const referenceId = value.referenceId
    if (typeof referenceId === "string" && referenceId !== "" && referenceId !== primaryId) {
        ids.push(referenceId)
    }
    return { lapIds: ids }
}

export const restoreComparison = (
    laps: readonly CompareLap[],
    stored: StoredComparison | undefined
): StoredComparison | undefined => {
    if (!stored || stored.lapIds.length === 0) return undefined
    const primary = laps.find(lap => lap.id === stored.lapIds[0])
    if (!primary) return undefined
    const kept = [primary.id]
    for (const id of stored.lapIds.slice(1)) {
        if (kept.length >= MAX_COMPARE_LAPS) break
        if (kept.includes(id)) continue
        const match = laps.find(
            lap => lap.id === id && lap.track === primary.track
        )
        if (match) kept.push(match.id)
    }
    return { lapIds: kept }
}

export const normalizeLapIds = (ids: readonly string[]): string[] => {
    const kept: string[] = []
    for (const id of ids) {
        if (typeof id !== "string" || id === "") continue
        if (kept.includes(id)) continue
        kept.push(id)
        if (kept.length >= MAX_COMPARE_LAPS) break
    }
    return kept
}

export const primaryLapForSession = <T extends SessionLapRef>(
    laps: readonly T[],
    sessionId: string,
    preferredLapId?: string
): T | undefined => {
    const own = laps.filter(
        lap => lap.sessionId === sessionId && lap.timeMs !== null
    )
    if (own.length === 0) return undefined
    if (preferredLapId) {
        const preferred = own.find(lap => lap.id === preferredLapId)
        if (preferred) return preferred
    }
    const valid = own.filter(lap => lap.valid)
    const pool = valid.length > 0 ? valid : own
    return pool.reduce((best, lap) =>
        (lap.timeMs ?? Infinity) < (best.timeMs ?? Infinity) ? lap : best
    )
}

export const readStoredComparison = (): StoredComparison | undefined => {
    if (typeof localStorage === "undefined") return undefined
    try {
        return parseStoredComparison(localStorage.getItem(COMPARE_KEY))
    } catch {
        return undefined
    }
}

export const writeStoredComparison = (comparison: StoredComparison): void => {
    if (typeof localStorage === "undefined") return
    try {
        const lapIds = normalizeLapIds(comparison.lapIds)
        if (lapIds.length === 0) return
        localStorage.setItem(COMPARE_KEY, JSON.stringify({ lapIds }))
    } catch {
    }
}

export const clearStoredComparison = (): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.removeItem(COMPARE_KEY)
    } catch {
    }
}

const parseLapIds = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value) || value.length === 0) return undefined
    const ids = normalizeLapIds(
        value.filter((item): item is string => typeof item === "string")
    )
    return ids.length > 0 ? ids : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null
