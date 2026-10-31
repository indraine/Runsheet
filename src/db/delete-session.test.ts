import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"
import { seedReferenceLaps, type ReferenceFile } from "~/db/reference-laps"
import { SessionRepository } from "~/db/repository"
import { openRunsheetDb, type RunsheetDatabase } from "~/db/schema"
import { dumpFileName } from "~/db/transfer"
import { TRACE_CHANNELS, type Lap, type Session, type Trace } from "~/domain"

const files = Object.values(
    import.meta.glob<ReferenceFile>("./reference/*.json", {
        eager: true,
        import: "default",
    })
)

const session = (id: string): Session => ({
    id,
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
})

const lap = (id: string, sessionId: string): Lap =>
    ({
        id,
        sessionId,
        number: 1,
        timeMs: 110_000,
        valid: true,
        maxSpeed: 250,
        fuel: 40,
    }) as unknown as Lap

const trace = (lapId: string): Trace => {
    const value = { lapId } as Trace
    for (const channel of TRACE_CHANNELS) value[channel] = new Float32Array(3)
    return value
}

let db: RunsheetDatabase
let repo: SessionRepository
let counter = 0

beforeEach(async () => {
    counter += 1
    db = await openRunsheetDb(`delete-test-${counter}`)
    repo = new SessionRepository(db)
    for (const id of ["a", "b"]) {
        await repo.upsert({
            session: session(id),
            lap: lap(`lap-${id}`, id),
            trace: trace(`lap-${id}`),
        })
    }
})

describe("deleting a session", () => {
    it("removes the session with its laps and telemetry, and only those", async () => {
        await repo.deleteSession("a")
        expect((await repo.readSessions()).map(item => item.id)).toEqual(["b"])
        expect(await repo.readLaps("a")).toHaveLength(0)
        expect((await repo.readTraces(["lap-a"])).size).toBe(0)
        expect(await repo.readLaps("b")).toHaveLength(1)
        expect((await repo.readTraces(["lap-b"])).size).toBe(1)
    })

    it("bumps the revision so the list reloads", async () => {
        const before = repo.revision()
        await repo.deleteSession("a")
        expect(repo.revision()).toBe(before + 1)
    })

    it("leaves bundled reference laps alone", async () => {
        await seedReferenceLaps(db, files)
        const reference = (await db.getAll("sessions")).find(
            item => item.reference
        )!
        await repo.deleteSession(reference.id)
        expect(
            (await repo.readSessions({ withReference: true })).some(
                item => item.id === reference.id
            )
        ).toBe(true)
    })

    it("ignores an unknown id", async () => {
        await repo.deleteSession("nope")
        expect(await repo.readSessions()).toHaveLength(2)
    })
})

describe("exporting one session", () => {
    it("holds only that session, its laps and traces", async () => {
        const dump = await repo.exportAll("b")
        expect(dump.sessions.map(item => item.id)).toEqual(["b"])
        expect(dump.laps.map(item => item.id)).toEqual(["lap-b"])
        expect(dump.traces.map(item => item.lapId)).toEqual(["lap-b"])
    })

    it("still exports everything without an id", async () => {
        expect((await repo.exportAll()).sessions).toHaveLength(2)
    })

    it("names the file after the track", () => {
        const at = new Date(2026, 9, 31).getTime()
        expect(dumpFileName(at, "runsheet", "monza")).toBe(
            "runsheet-monza-2026-10-31.runsheet"
        )
        expect(dumpFileName(at)).toBe("runsheet-2026-10-31.json")
    })
})
