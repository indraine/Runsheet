import type { Lap } from "~/domain"

/**
 * Litres used on a finished lap, from the fuel delta to the previous row.
 *
 * Open laps and the first row of a stint have no previous reading.
 *
 * @example
 * ```ts
 * fuelPerLap(
 *   { fuel: 55, timeMs: 90_000 },
 *   { fuel: 58, timeMs: 91_000 }
 * )
 * // 3
 * ```
 */
export const fuelPerLap = (
    lap: Pick<Lap, "fuel" | "timeMs">,
    previous: Pick<Lap, "fuel"> | undefined
): number | undefined => {
    if (lap.timeMs === null || previous === undefined) return undefined
    const used = previous.fuel - lap.fuel
    if (!Number.isFinite(used) || used <= 0) return undefined
    return used
}

/**
 * Whole laps that fit in the tank at the latest known litres-per-lap.
 *
 * @example
 * ```ts
 * stintLapsLeft(55, 3) // 18
 * ```
 */
export const stintLapsLeft = (
    fuelL: number,
    litresPerLap: number | undefined
): number | undefined => {
    if (
        !Number.isFinite(fuelL) ||
        fuelL < 0 ||
        litresPerLap === undefined ||
        !(litresPerLap > 0)
    ) {
        return undefined
    }
    return Math.floor(fuelL / litresPerLap)
}

/**
 * Mean litres-per-lap across a finished stint, newest last.
 *
 * @example
 * ```ts
 * meanFuelPerLap([
 *   { fuel: 61, timeMs: 91_000 },
 *   { fuel: 58, timeMs: 90_500 },
 *   { fuel: 55, timeMs: 90_000 },
 * ])
 * // 3
 * ```
 */
export const meanFuelPerLap = (
    laps: readonly Pick<Lap, "fuel" | "timeMs">[]
): number | undefined => {
    const samples: number[] = []
    for (let index = 1; index < laps.length; index += 1) {
        const used = fuelPerLap(laps[index], laps[index - 1])
        if (used !== undefined) samples.push(used)
    }
    if (samples.length === 0) return undefined
    return samples.reduce((sum, value) => sum + value, 0) / samples.length
}
