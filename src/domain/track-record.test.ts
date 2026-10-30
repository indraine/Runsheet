import { describe, expect, it } from "vitest"
import { sortTracks } from "~/domain/track-record"

const names: Record<string, string> = {
    barcelona: "Барселона",
    brands_hatch: "Брэндс-Хэтч",
    cota: "Остин",
    donington: "Донингтон",
    zolder: "Золдер",
    spa: "Спа",
}
const nameOf = (code: string) => names[code] ?? code
const codes = Object.keys(names)

describe("sortTracks by name", () => {
    it("sorts Russian names by the Russian alphabet", () => {
        expect(sortTracks(codes, new Map(), "name", nameOf, "ru")).toEqual([
            "barcelona",
            "brands_hatch",
            "donington",
            "zolder",
            "cota",
            "spa",
        ])
    })

    it("sorts by the name shown, not by the catalog order", () => {
        const shown = (code: string) => (code === "cota" ? "Austin" : code)
        const result = sortTracks(
            ["spa", "cota", "barcelona"],
            new Map(),
            "name",
            shown,
            "en"
        )
        expect(result).toEqual(["cota", "barcelona", "spa"])
    })

    it("keeps the catalog order for equal names", () => {
        const same = () => "Track"
        expect(sortTracks(["b", "a"], new Map(), "name", same, "en")).toEqual([
            "b",
            "a",
        ])
    })
})
