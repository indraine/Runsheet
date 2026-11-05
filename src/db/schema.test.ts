import "fake-indexeddb/auto"
import { openDB } from "idb"
import { describe, expect, it } from "vitest"
import { canonicalTrack, openRunsheetDb } from "~/db/schema"

describe("canonicalTrack", () => {
    it("lowercases and trims ACC track codes", () => {
        expect(canonicalTrack("Spa")).toBe("spa")
        expect(canonicalTrack(" brands_hatch ")).toBe("brands_hatch")
    })
})

describe("upgrading to v3", () => {
    it("rewrites stored track codes into canonical form", async () => {
        const name = "schema-v3-test"
        const legacy = await openDB(name, 2, {
            upgrade(db) {
                db.createObjectStore("sessions", { keyPath: "id" })
                const laps = db.createObjectStore("laps", { keyPath: "id" })
                laps.createIndex("sessionId", "sessionId")
                db.createObjectStore("lap_telemetry", { keyPath: "lapId" })
            },
        })
        await legacy.put("sessions", { id: "a", track: "Spa" })
        await legacy.put("sessions", { id: "b", track: "monza" })
        legacy.close()

        const db = await openRunsheetDb(name)
        const tracks = (await db.getAll("sessions")).map(item => item.track)
        expect(tracks).toEqual(["spa", "monza"])
        db.close()
    })
})
