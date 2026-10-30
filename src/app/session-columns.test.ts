import { describe, expect, it } from "vitest"
import {
    SESSION_COLUMNS,
    parseSessionColumns,
    toggleSessionColumn,
} from "~/app/session-columns"

describe("parseSessionColumns", () => {
    it("shows every column when nothing is stored", () => {
        expect(parseSessionColumns(null)).toEqual(SESSION_COLUMNS)
    })

    it("falls back to every column on broken JSON or a wrong shape", () => {
        expect(parseSessionColumns("{")).toEqual(SESSION_COLUMNS)
        expect(parseSessionColumns('{"a":1}')).toEqual(SESSION_COLUMNS)
        expect(parseSessionColumns("[]")).toEqual(SESSION_COLUMNS)
    })

    it("drops unknown ids and keeps the table's own order", () => {
        expect(parseSessionColumns('["best","track","x",7]')).toEqual([
            "track",
            "best",
        ])
    })

    it("falls back when no stored id is known", () => {
        expect(parseSessionColumns('["x","y"]')).toEqual(SESSION_COLUMNS)
    })
})

describe("toggleSessionColumn", () => {
    it("hides a visible column", () => {
        expect(toggleSessionColumn(SESSION_COLUMNS, "driver")).toEqual([
            "time",
            "track",
            "type",
            "car",
            "best",
        ])
    })

    it("restores a hidden column at its own place", () => {
        expect(toggleSessionColumn(["time", "best"], "track")).toEqual([
            "time",
            "track",
            "best",
        ])
    })

    it("keeps the last visible column", () => {
        expect(toggleSessionColumn(["best"], "best")).toEqual(["best"])
    })
})
