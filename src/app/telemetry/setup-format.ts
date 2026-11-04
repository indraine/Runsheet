import type { Lap } from "~/domain"

const EMPTY = "—"

export const formatBrakeBias = (fraction: number): string =>
    fraction > 0 && Number.isFinite(fraction)
        ? `${(fraction * 100).toFixed(1)}%`
        : EMPTY

export const formatPressure = (value: number | undefined): string =>
    value !== undefined && Number.isFinite(value) && value > 0
        ? value.toFixed(1)
        : EMPTY

export const formatFuelPerLap = (litres: number | undefined): string =>
    litres === undefined ? EMPTY : litres.toFixed(2)

export const previousLap = (
    sessionLaps: readonly Lap[],
    lap: Lap
): Lap | undefined => sessionLaps.find(item => item.number === lap.number - 1)
