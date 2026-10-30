import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"
import { seedReferenceLaps, type ReferenceFile } from "~/db/reference-laps"
import { SessionRepository } from "~/db/repository"
import { openRunsheetDb, type RunsheetDatabase } from "~/db/schema"
import type { Session } from "~/domain"

const files = Object.values(
    import.meta.glob<ReferenceFile>("./reference/*.json", {
        eager: true,
        import: "default",
    })
)

const recorded: Session = {
    id: "mine",
    outingId: "o1",
    startedAt: 1_700_000_000_000,
    endedAt: null,
    online: false,
    track: "monza",
    car: "bmw_m4_gt3",
    driver: "Me",
    carId: 1,
    type: "practice",
    carCount: 1,
    status: "closed",
    airTemp: 20,
    roadTemp: 25,
}

let db: RunsheetDatabase
let repo: SessionRepository
let counter = 0

beforeEach(async () => {
    counter += 1
    db = await openRunsheetDb(`reference-test-${counter}`)
    repo = new SessionRepository(db)
    await repo.upsert({ session: recorded })
})

describe("reference laps in the database", () => {
    it("are seeded once and left alone on the next start", async () => {
        expect(await seedReferenceLaps(db, files)).toBe(14)
        expect(await seedReferenceLaps(db, files)).toBe(0)
        expect((await db.getAll("sessions")).length).toBe(15)
        expect((await db.getAll("lap_telemetry")).length).toBe(14)
    })

    it("are rewritten when the bundled version is newer", async () => {
        await seedReferenceLaps(db, files)
        const row = (await db.getAll("sessions")).find(item => item.reference)!
        await db.put("sessions", { ...row, reference: 0.5 })
        expect(await seedReferenceLaps(db, files)).toBe(1)
    })

    it("stay out of the recorded sessions but can be asked for", async () => {
        await seedReferenceLaps(db, files)
        expect((await repo.readSessions()).map(item => item.id)).toEqual([
            "mine",
        ])
        expect((await repo.readSessions({ withReference: true })).length).toBe(
            15
        )
        expect(await repo.readDay(recorded.startedAt)).toHaveLength(1)
    })

    it("are not exported", async () => {
        await seedReferenceLaps(db, files)
        const dump = await repo.exportAll()
        expect(dump.sessions.map(item => item.id)).toEqual(["mine"])
        expect(dump.traces).toHaveLength(0)
    })

    it("survive clearing recorded data", async () => {
        await seedReferenceLaps(db, files)
        await repo.clearAll()
        expect(await repo.readSessions()).toHaveLength(0)
        expect((await repo.readSessions({ withReference: true })).length).toBe(
            14
        )
        expect((await db.getAll("lap_telemetry")).length).toBe(14)
    })
})
