/** Fallback Pixi colors when CSS variables are unavailable. */
export const LAP_COLOR_FALLBACKS = [
    0xea580c,
    0x2563eb,
    0x16a34a,
    0xa855f7,
] as const

/** CSS custom property names for up to four compare traces. */
export const LAP_COLOR_VARS = [
    "--lap-a",
    "--lap-b",
    "--lap-c",
    "--lap-d",
] as const

/**
 * Color slot for a compare lap. Index `0` is the baseline.
 *
 * @example
 * ```ts
 * lapColorVar(0) // "--lap-a"
 * ```
 */
export const lapColorVar = (index: number): string =>
    LAP_COLOR_VARS[Math.max(0, Math.min(index, LAP_COLOR_VARS.length - 1))] ??
    LAP_COLOR_VARS[0]

export const lapColorFallback = (index: number): number =>
    LAP_COLOR_FALLBACKS[
        Math.max(0, Math.min(index, LAP_COLOR_FALLBACKS.length - 1))
    ] ?? LAP_COLOR_FALLBACKS[0]
