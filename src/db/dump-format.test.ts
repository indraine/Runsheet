import { describe, expect, it } from "vitest"
import { stringifyDump } from "./transfer"
import type { RunsheetDump } from "./transfer"

const dump = {
    format: "runsheet-dump",
    version: 1,
    dbVersion: 2,
    exportedAt: 1,
    sessions: [{ id: "s1", track: "monza" }],
    laps: [],
    traces: [{ lapId: "l1", speed: [1.5, 2.5, 3.5], steer: [0, -0.1] }],
} as unknown as RunsheetDump

describe("dump export", () => {
    it("indents objects and keeps sample arrays on one line", () => {
        const text = stringifyDump(dump)
        expect(text).toContain('\n  "format": "runsheet-dump"')
        expect(text).toContain('"speed": [1.5,2.5,3.5]')
        expect(text.split("\n").length).toBeLessThan(40)
    })

    it("reads back as the same data", () => {
        expect(JSON.parse(stringifyDump(dump))).toEqual(dump)
    })
})
