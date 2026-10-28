import type { Lap } from "~/domain"

const EMPTY = "—"

/**
 * Front brake bias as a percentage. Rows saved before electronics existed
 * store `0`, which shows as empty.
 *
 * @example
 * ```ts
 * formatBrakeBias(0.575) // "57.5%"
 * ```
 */
export const formatBrakeBias = (fraction: number): string =>
    fraction > 0 && Number.isFinite(fraction)
        ? `${(fraction * 100).toFixed(1)}%`
        : EMPTY

/**
 * Hot tyre pressure with one decimal, or a dash when the sample is missing.
 *
 * @example
 * ```ts
 * formatPressure(27.64) // "27.6"
 * ```
 */
export const formatPressure = (value: number | undefined): string =>
    value !== undefined && Number.isFinite(value) && value > 0
        ? value.toFixed(1)
        : EMPTY

/**
 * Litres burnt on the lap, or a dash when it cannot be derived.
 *
 * @example
 * ```ts
 * formatFuelPerLap(2.846) // "2.85"
 * ```
 */
export const formatFuelPerLap = (litres: number | undefined): string =>
    litres === undefined ? EMPTY : litres.toFixed(2)

/**
 * Previous lap by number in the same session, or undefined when the
 * numbers are not consecutive (an out-of-order or missing lap).
 *
 * @example
 * ```ts
 * previousLap(laps, laps[2]) // laps[1] when numbers 2 and 3
 * ```
 */
export const previousLap = (
    sessionLaps: readonly Lap[],
    lap: Lap
): Lap | undefined => sessionLaps.find(item => item.number === lap.number - 1)
