import { normalizeLapIds } from "~/app/telemetry/compare-selection"

/**
 * Put another lap in a slot. A lap already chosen elsewhere is ignored so
 * the set never holds a duplicate.
 *
 * @example
 * ```ts
 * replaceLapId(["a", "b"], 1, "c") // ["a", "c"]
 * replaceLapId(["a", "b"], 1, "a") // ["a", "b"]
 * ```
 */
export const replaceLapId = (
    ids: readonly string[],
    index: number,
    lapId: string
): string[] => {
    if (index < 0 || index >= ids.length) return [...ids]
    if (ids.some((id, at) => id === lapId && at !== index)) return [...ids]
    return normalizeLapIds(ids.map((id, at) => (at === index ? lapId : id)))
}

/**
 * Swap a lap with the baseline (slot 0), so the colors follow the slots.
 *
 * @example
 * ```ts
 * makeBaselineId(["a", "b", "c"], 2) // ["c", "b", "a"]
 * ```
 */
export const makeBaselineId = (
    ids: readonly string[],
    index: number
): string[] => {
    const next = [...ids]
    const picked = next[index]
    const baseline = next[0]
    if (index <= 0 || picked === undefined || baseline === undefined) {
        return next
    }
    next[0] = picked
    next[index] = baseline
    return next
}

/**
 * Add or remove a lap, respecting the four-lap ceiling.
 *
 * @example
 * ```ts
 * toggleLapId(["a"], "b") // ["a", "b"]
 * toggleLapId(["a", "b"], "a") // ["b"]
 * ```
 */
export const toggleLapId = (ids: readonly string[], lapId: string): string[] =>
    ids.includes(lapId)
        ? ids.filter(id => id !== lapId)
        : normalizeLapIds([...ids, lapId])
