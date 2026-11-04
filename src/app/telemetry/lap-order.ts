import { normalizeLapIds } from "~/app/telemetry/compare-selection"

export const replaceLapId = (
    ids: readonly string[],
    index: number,
    lapId: string
): string[] => {
    if (index < 0 || index >= ids.length) return [...ids]
    if (ids.some((id, at) => id === lapId && at !== index)) return [...ids]
    return normalizeLapIds(ids.map((id, at) => (at === index ? lapId : id)))
}

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

export const toggleLapId = (ids: readonly string[], lapId: string): string[] =>
    ids.includes(lapId)
        ? ids.filter(id => id !== lapId)
        : normalizeLapIds([...ids, lapId])
