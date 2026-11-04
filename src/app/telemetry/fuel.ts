import type { Lap } from "~/domain"

export const fuelPerLap = (
    lap: Pick<Lap, "fuel" | "timeMs">,
    previous: Pick<Lap, "fuel"> | undefined
): number | undefined => {
    if (lap.timeMs === null || previous === undefined) return undefined
    const used = previous.fuel - lap.fuel
    if (!Number.isFinite(used) || used <= 0) return undefined
    return used
}

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
