import { describe, expect, it } from "vitest"
import { carBrand } from "~/domain/car-brand"
import { CAR_CODES } from "~/i18n/cars"

describe("carBrand", () => {
    it("reads the brand from the model code prefix", () => {
        expect(carBrand("porsche_992_gt3_r")).toBe("porsche")
        expect(carBrand("mercedes_amg_gt3_evo")).toBe("mercedes")
        expect(carBrand("alpine_a110_gt4")).toBe("alpine")
    })

    it("maps the Aston Martin code prefix", () => {
        expect(carBrand("amr_v8_vantage_gt4")).toBe("astonmartin")
    })

    it("returns null for an unknown or empty code", () => {
        expect(carBrand("trabant_601")).toBeNull()
        expect(carBrand("")).toBeNull()
        expect(carBrand("constructor")).toBeNull()
    })

    it("knows the brand of every car in the catalog", () => {
        const missing = CAR_CODES.filter(code => carBrand(code) === null)
        expect(missing).toEqual([])
    })
})
