import { describe, expect, it } from "vitest"
import {
    driversOnTrack,
    filterChoices,
    toggleDriver,
    type CompareChoice,
} from "~/app/telemetry/compare-filters"
import { localDayStart, type Session } from "~/domain"

const day = (y: number, m: number, d: number): number =>
    new Date(y, m - 1, d, 12, 0, 0).getTime()

const session = (partial: Partial<Session> & Pick<Session, "id">): Session =>
    ({
        outingId: "o",
        startedAt: day(2024, 6, 1),
        endedAt: null,
        online: false,
        track: "monza",
        car: "bmw_m4_gt3",
        driver: "Alex",
        carId: 0,
        type: "practice",
        carCount: 1,
        status: "closed",
        airTemp: 20,
        roadTemp: 30,
        ...partial,
    }) as Session

const choice = (partial: Partial<Session> & Pick<Session, "id">): CompareChoice => ({
    session: session(partial),
})

describe("driversOnTrack", () => {
    it("lists unique drivers on the track, empty nick last", () => {
        const list = driversOnTrack(
            [
                choice({ id: "1", driver: "Bob", track: "monza" }),
                choice({ id: "2", driver: "Alex", track: "monza" }),
                choice({ id: "3", driver: "Alex", track: "monza" }),
                choice({ id: "4", driver: "", track: "monza" }),
                choice({ id: "5", driver: "Zoe", track: "spa" }),
            ],
            "monza"
        )
        expect(list).toEqual(["Alex", "Bob", ""])
    })
})

describe("filterChoices", () => {
    const catalog = [
        choice({
            id: "a",
            driver: "Alex",
            track: "monza",
            car: "bmw_m4_gt3",
            startedAt: day(2024, 6, 1),
        }),
        choice({
            id: "b",
            driver: "Bob",
            track: "monza",
            car: "ferrari_296_gt3",
            startedAt: day(2024, 6, 2),
        }),
        choice({
            id: "c",
            driver: "Alex",
            track: "spa",
            car: "bmw_m4_gt3",
            startedAt: day(2024, 6, 1),
        }),
        choice({
            id: "d",
            driver: "",
            track: "monza",
            car: "porsche_992_gt3_r",
            startedAt: day(2024, 6, 1),
        }),
    ]

    it("requires a track", () => {
        expect(
            filterChoices(catalog, {
                track: "",
                drivers: [],
                dayStart: null,
                query: "",
            })
        ).toEqual([])
    })

    it("keeps every driver and day when those filters are open", () => {
        const ids = filterChoices(catalog, {
            track: "monza",
            drivers: [],
            dayStart: null,
            query: "",
        }).map(item => item.session.id)
        expect(ids).toEqual(["a", "b", "d"])
    })

    it("filters by driver multi-select including empty nick", () => {
        const ids = filterChoices(catalog, {
            track: "monza",
            drivers: ["Alex", ""],
            dayStart: null,
            query: "",
        }).map(item => item.session.id)
        expect(ids).toEqual(["a", "d"])
    })

    it("filters by local day", () => {
        const ids = filterChoices(catalog, {
            track: "monza",
            drivers: [],
            dayStart: localDayStart(day(2024, 6, 2)),
            query: "",
        }).map(item => item.session.id)
        expect(ids).toEqual(["b"])
    })

    it("matches query against driver and car code", () => {
        expect(
            filterChoices(catalog, {
                track: "monza",
                drivers: [],
                dayStart: null,
                query: "bob",
            }).map(item => item.session.id)
        ).toEqual(["b"])
        expect(
            filterChoices(catalog, {
                track: "monza",
                drivers: [],
                dayStart: null,
                query: "porsche",
            }).map(item => item.session.id)
        ).toEqual(["d"])
    })
})

describe("toggleDriver", () => {
    it("adds and removes drivers", () => {
        expect(toggleDriver([], "Alex")).toEqual(["Alex"])
        expect(toggleDriver(["Alex", "Bob"], "Alex")).toEqual(["Bob"])
    })
})
