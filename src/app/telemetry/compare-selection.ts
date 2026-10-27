const COMPARE_KEY = "runsheet.telemetry-compare"

/** Lap pair last confirmed on the telemetry page. */
export type StoredComparison = {
    primaryId: string
    referenceId: string | undefined
}

/** A lap that can be checked against a stored comparison. */
export type CompareLap = {
    id: string
    track: string
}

/** A catalog lap that can stand for a timeline session. */
export type SessionLapRef = {
    id: string
    sessionId: string
    valid: boolean
    timeMs: number | null
}

/**
 * Read a stored comparison payload.
 *
 * Empty ids and broken JSON are dropped so a corrupt entry cannot
 * reopen a comparison that no longer makes sense.
 *
 * @example
 * ```ts
 * parseStoredComparison('{"primaryId":"a","referenceId":"b"}')
 * // { primaryId: "a", referenceId: "b" }
 * ```
 */
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
    const primaryId = value.primaryId
    if (typeof primaryId !== "string" || primaryId === "") return undefined
    const referenceId = value.referenceId
    if (referenceId == null) return { primaryId, referenceId: undefined }
    if (typeof referenceId !== "string" || referenceId === "") {
        return { primaryId, referenceId: undefined }
    }
    if (referenceId === primaryId) return { primaryId, referenceId: undefined }
    return { primaryId, referenceId }
}

/**
 * Keep a stored pair only when both laps still exist on the same track.
 *
 * A missing reference is dropped and the primary lap is kept. An unknown
 * primary lap drops the whole pair.
 *
 * @example
 * ```ts
 * restoreComparison(
 *   [{ id: "a", track: "spa" }, { id: "b", track: "spa" }],
 *   { primaryId: "a", referenceId: "b" }
 * )
 * // { primaryId: "a", referenceId: "b" }
 * ```
 */
export const restoreComparison = (
    laps: readonly CompareLap[],
    stored: StoredComparison | undefined
): StoredComparison | undefined => {
    if (!stored) return undefined
    const primary = laps.find(lap => lap.id === stored.primaryId)
    if (!primary) return undefined
    const reference = stored.referenceId
        ? laps.find(
              lap =>
                  lap.id === stored.referenceId &&
                  lap.track === primary.track &&
                  lap.id !== primary.id
          )
        : undefined
    return { primaryId: primary.id, referenceId: reference?.id }
}

/**
 * Lap that should open on the left when a timeline session is compared.
 *
 * The preferred lap wins when it still belongs to that session. Otherwise
 * the fastest valid lap is used, then any timed lap.
 *
 * @example
 * ```ts
 * primaryLapForSession(
 *   [
 *     { id: "slow", sessionId: "s", valid: true, timeMs: 90_000 },
 *     { id: "fast", sessionId: "s", valid: true, timeMs: 80_000 },
 *   ],
 *   "s"
 * )
 * // { id: "fast", sessionId: "s", valid: true, timeMs: 80_000 }
 * ```
 */
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

/** Last comparison saved in this browser, if the payload is still valid. */
export const readStoredComparison = (): StoredComparison | undefined => {
    if (typeof localStorage === "undefined") return undefined
    try {
        return parseStoredComparison(localStorage.getItem(COMPARE_KEY))
    } catch {
        return undefined
    }
}

/** Remember the comparison that should come back after a reload. */
export const writeStoredComparison = (comparison: StoredComparison): void => {
    if (typeof localStorage === "undefined") return
    try {
        const payload: { primaryId: string; referenceId?: string } = {
            primaryId: comparison.primaryId,
        }
        if (comparison.referenceId) payload.referenceId = comparison.referenceId
        localStorage.setItem(COMPARE_KEY, JSON.stringify(payload))
    } catch {
        // Storage can be unavailable in private mode. The page still works.
    }
}

/** Drop a comparison that no longer matches a lap in the catalog. */
export const clearStoredComparison = (): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.removeItem(COMPARE_KEY)
    } catch {
        // Same as write: a storage failure leaves the in-memory page usable.
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null
