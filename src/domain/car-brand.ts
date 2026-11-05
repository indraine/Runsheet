export const CAR_BRANDS = [
    "alpine",
    "astonmartin",
    "audi",
    "bentley",
    "bmw",
    "chevrolet",
    "ferrari",
    "ford",
    "ginetta",
    "honda",
    "jaguar",
    "ktm",
    "lamborghini",
    "lexus",
    "maserati",
    "mclaren",
    "mercedes",
    "nissan",
    "porsche",
] as const

export type CarBrand = (typeof CAR_BRANDS)[number]

const ALIASES: ReadonlyMap<string, CarBrand> = new Map([["amr", "astonmartin"]])

const isCarBrand = (value: string): value is CarBrand =>
    (CAR_BRANDS as readonly string[]).includes(value)

/**
 * Maker of an ACC car, read from the prefix of its model code.
 *
 * @example carBrand("amr_v8_vantage_gt3") // "astonmartin"
 * @example carBrand("porsche_992_gt3_r") // "porsche"
 * @example carBrand("unknown_car") // null
 */
export const carBrand = (code: string): CarBrand | null => {
    const prefix = code.split("_", 1)[0]
    const alias = ALIASES.get(prefix)
    if (alias) return alias
    return isCarBrand(prefix) ? prefix : null
}
