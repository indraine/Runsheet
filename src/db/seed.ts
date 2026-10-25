import { boundariesFor } from "~/app/track-catalog"
import {
    TRACE_CHANNELS,
    type Lap,
    type Session,
    type Trace,
    type TraceChannel,
} from "~/domain"
import type { RunsheetDatabase } from "~/db/schema"

const CAR_BMW_M4 = "bmw_m4_gt3"
const TRACK_MONZA = "monza"
const TRACK_SPA = "spa"

const OUTING_MONZA = "seed-outing-monza"
const OUTING_SPA = "seed-outing-spa"
const OUTING_NEXT = "seed-outing-next"
const SESSION_MONZA = "seed-monza-practice"
const SESSION_SPA_PRACTICE = "seed-spa-practice"
const SESSION_SPA_QUALIFYING = "seed-spa-qualifying"

const SEED_VERSION = "4"
const SEED_VERSION_KEY = "runsheet.seed"

const LAP_METRES = 7004
const S1_END_M = 2340
const S2_END_M = 5200
const SAMPLE_COUNT = 120

const spaOutline = boundariesFor("spa")
if (!spaOutline) {
    throw new Error("Spa center line is missing from centerlines")
}

const GROUND: ReadonlyArray<readonly [number, number]> = spaOutline.center.map(
    point => [point.x, point.y]
)

const BRAKE_ZONES = [0.16, 0.38, 0.62, 0.84]

type Clock = string | null

type LapRow = {
    number: number
    time: Clock
    s1: Clock
    s2: Clock
    s3: Clock
    valid: boolean
    maxSpeed: number
    fuel: number
}

const QUALIFYING_LAPS: readonly LapRow[] = [
    {
        number: 1,
        time: "2:29.412",
        s1: "44.890",
        s2: "1:08.120",
        s3: "36.402",
        valid: false,
        maxSpeed: 248,
        fuel: 62,
    },
    {
        number: 2,
        time: "2:18.910",
        s1: "41.882",
        s2: "1:02.110",
        s3: "34.918",
        valid: true,
        maxSpeed: 271,
        fuel: 58.9,
    },
    {
        number: 3,
        time: "2:18.150",
        s1: "41.620",
        s2: "1:01.812",
        s3: "34.718",
        valid: true,
        maxSpeed: 273,
        fuel: 55.8,
    },
    {
        number: 4,
        time: "2:17.980",
        s1: "41.490",
        s2: "1:01.840",
        s3: "34.650",
        valid: true,
        maxSpeed: 274,
        fuel: 52.7,
    },
    {
        number: 5,
        time: "2:17.842",
        s1: "41.512",
        s2: "1:01.710",
        s3: "34.620",
        valid: true,
        maxSpeed: 276,
        fuel: 49.6,
    },
    {
        number: 6,
        time: "2:18.220",
        s1: "41.710",
        s2: "1:01.905",
        s3: "34.605",
        valid: true,
        maxSpeed: 272,
        fuel: 46.5,
    },
    {
        number: 7,
        time: null,
        s1: "41.460",
        s2: null,
        s3: null,
        valid: true,
        maxSpeed: 270,
        fuel: 43.4,
    },
]

const TRACE_LAPS = [
    { id: "seed-spa-q-5", time: "2:17.842", slower: false },
    { id: "seed-spa-q-6", time: "2:18.220", slower: true },
] as const

export type DevDay = {
    sessions: Session[]
    laps: Lap[]
    traces: Trace[]
}

type SeedOptions = {
    dev?: boolean
    now?: number
}

export function devDay(now: number): DevDay {
    const monzaStart = localTime(now, 21, 4)
    const practiceStart = localTime(now, 21, 41)
    const qualifyingStart = localTime(now, 22, 2)
    const next = shiftDays(now, 1)
    const nextPractice = localTime(next, 10, 15)
    const nextPracticeLater = localTime(next, 11, 40)
    const nextQualifying = localTime(next, 15, 5)
    const nextRace = localTime(next, 16, 48)

    const sessions: Session[] = [
        {
            id: SESSION_MONZA,
            outingId: OUTING_MONZA,
            startedAt: monzaStart,
            endedAt: localTime(now, 21, 36),
            online: false,
            track: TRACK_MONZA,
            car: CAR_BMW_M4,
            type: "practice",
            carCount: 1,
            status: "closed",
            airTemp: 23.5,
            roadTemp: 32.1,
        },
        {
            id: SESSION_SPA_PRACTICE,
            outingId: OUTING_SPA,
            startedAt: practiceStart,
            endedAt: qualifyingStart,
            online: true,
            track: TRACK_SPA,
            car: CAR_BMW_M4,
            type: "practice",
            carCount: 22,
            status: "closed",
            airTemp: 20.4,
            roadTemp: 27.2,
        },
        {
            id: SESSION_SPA_QUALIFYING,
            outingId: OUTING_SPA,
            startedAt: qualifyingStart,
            endedAt: localTime(now, 22, 20),
            online: true,
            track: TRACK_SPA,
            car: CAR_BMW_M4,
            type: "qualifying",
            carCount: 22,
            status: "closed",
            airTemp: 21,
            roadTemp: 28.4,
        },
        {
            id: "seed-next-practice",
            outingId: OUTING_NEXT,
            startedAt: nextPractice,
            endedAt: localTime(next, 11, 2),
            online: false,
            track: TRACK_MONZA,
            car: CAR_BMW_M4,
            type: "practice",
            carCount: 1,
            status: "closed",
            airTemp: 18.2,
            roadTemp: 24.6,
        },
        {
            id: "seed-next-practice-2",
            outingId: OUTING_NEXT,
            startedAt: nextPracticeLater,
            endedAt: localTime(next, 12, 28),
            online: true,
            track: TRACK_SPA,
            car: CAR_BMW_M4,
            type: "practice",
            carCount: 20,
            status: "closed",
            airTemp: 19.1,
            roadTemp: 26.4,
        },
        {
            id: "seed-next-qualifying",
            outingId: OUTING_NEXT,
            startedAt: nextQualifying,
            endedAt: localTime(next, 15, 32),
            online: true,
            track: TRACK_SPA,
            car: CAR_BMW_M4,
            type: "qualifying",
            carCount: 22,
            status: "closed",
            airTemp: 21.4,
            roadTemp: 29.8,
        },
        {
            id: "seed-next-race",
            outingId: OUTING_NEXT,
            startedAt: nextRace,
            endedAt: localTime(next, 17, 26),
            online: true,
            track: TRACK_SPA,
            car: CAR_BMW_M4,
            type: "race",
            carCount: 22,
            status: "closed",
            airTemp: 20.8,
            roadTemp: 30.2,
        },
    ]

    const laps: Lap[] = [
        closedLap(
            SESSION_MONZA,
            "seed-monza-1",
            "1:47.330",
            289,
            38,
            2100,
            3900
        ),
        closedLap(
            SESSION_SPA_PRACTICE,
            "seed-spa-p-1",
            "2:18.050",
            271,
            51.2,
            S1_END_M,
            S2_END_M
        ),
        closedLap(
            "seed-next-practice",
            "seed-next-practice-1",
            "1:47.902",
            286,
            36,
            2100,
            3900
        ),
        closedLap(
            "seed-next-practice-2",
            "seed-next-practice-2-1",
            "2:19.110",
            268,
            48.4,
            S1_END_M,
            S2_END_M
        ),
        closedLap(
            "seed-next-qualifying",
            "seed-next-qualifying-1",
            "2:17.640",
            274,
            44.1,
            S1_END_M,
            S2_END_M
        ),
        closedLap(
            "seed-next-race",
            "seed-next-race-1",
            "2:18.774",
            270,
            22.6,
            S1_END_M,
            S2_END_M
        ),
        ...QUALIFYING_LAPS.map(row => qualifyingLap(row)),
    ]

    return {
        sessions,
        laps,
        traces: [
            ...TRACE_LAPS.map(lap =>
                lapTrace(lap.id, milliseconds(lap.time), lap.slower)
            ),
            lapTrace("seed-spa-q-7", milliseconds("2:18.000"), false, 0.52),
        ],
    }
}

export async function seedDevDay(
    database: RunsheetDatabase,
    options: SeedOptions = {}
): Promise<boolean> {
    const dev = options.dev ?? import.meta.env.DEV
    if (!dev) return false
    // The version is stored after the first seed, so a later wipe stays empty.
    if (readSeedVersion() === SEED_VERSION) return false

    const day = devDay(options.now ?? Date.now())
    const tx = database.transaction(["sessions", "laps", "traces"], "readwrite")
    const sessions = tx.objectStore("sessions")
    const laps = tx.objectStore("laps")
    const traces = tx.objectStore("traces")
    await Promise.all([
        ...day.sessions.map(session => sessions.put(session)),
        ...day.laps.map(lap => laps.put(lap)),
        ...day.traces.map(trace => traces.put(trace)),
        tx.done,
    ])
    writeSeedVersion()
    return true
}

const readSeedVersion = (): string | null => {
    try {
        return localStorage.getItem(SEED_VERSION_KEY)
    } catch {
        return null
    }
}

const writeSeedVersion = (): void => {
    try {
        localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION)
    } catch {
    }
}

function qualifyingLap(row: LapRow): Lap {
    return {
        id: `seed-spa-q-${row.number}`,
        sessionId: SESSION_SPA_QUALIFYING,
        number: row.number,
        timeMs: clockMs(row.time),
        s1Ms: clockMs(row.s1),
        s2Ms: clockMs(row.s2),
        s3Ms: clockMs(row.s3),
        s1EndM: row.s1 === null ? null : S1_END_M,
        s2EndM: row.s2 === null ? null : S2_END_M,
        valid: row.valid,
        maxSpeed: row.maxSpeed,
        fuel: row.fuel,
    }
}


function closedLap(
    sessionId: string,
    id: string,
    time: string,
    maxSpeed: number,
    fuel: number,
    s1EndM: number,
    s2EndM: number
): Lap {
    const timeMs = milliseconds(time)
    const s1Ms = Math.round(timeMs * 0.35)
    const s2Ms = Math.round(timeMs * 0.4)
    return {
        id,
        sessionId,
        number: 1,
        timeMs,
        s1Ms,
        s2Ms,
        s3Ms: timeMs - s1Ms - s2Ms,
        s1EndM,
        s2EndM,
        valid: true,
        maxSpeed,
        fuel,
    }
}

function lapTrace(
    lapId: string,
    lapTimeMs: number,
    slower: boolean,
    until = 1
): Trace {
    const columns = emptyColumns()
    const count = Math.max(2, Math.round((SAMPLE_COUNT - 1) * until) + 1)
    for (let index = 0; index < count; index += 1) {
        const fraction = (index / (SAMPLE_COUNT - 1)) * until
        const brake = brakeAt(fraction)
        const throttle = brake > 0.2 ? 0 : 1
        const speed = (160 + 112 * (1 - brake)) * (slower ? 0.985 : 1)
        const bump = slower ? Math.sin(fraction * Math.PI) * 400 : 0
        const ground = groundAt(fraction)
        const lateral = slower ? 6 : 0

        columns.distance.push(fraction * LAP_METRES)
        columns.time.push(fraction * lapTimeMs + bump)
        columns.speed.push(speed)
        columns.throttle.push(throttle)
        columns.brake.push(brake)
        columns.steer.push(Math.sin(fraction * Math.PI * 8) * (20 + brake * 90))
        columns.gLong.push((1 - brake) * 0.35 - brake * 1.4)
        columns.gLat.push(Math.sin(fraction * Math.PI * 4) * (0.4 + brake))
        columns.x.push(ground.x + lateral)
        columns.z.push(ground.z)
        columns.pressureFl.push(27.5 + fraction * 0.2)
        columns.pressureFr.push(27.8)
        columns.pressureRl.push(27.4)
        columns.pressureRr.push(27.7)
        columns.brakeTempFl.push(380 + brake * 280)
        columns.brakeTempFr.push(360 + brake * 260)
    }

    const trace = { lapId } as Trace
    for (const channel of TRACE_CHANNELS) {
        trace[channel] = Float32Array.from(columns[channel])
    }
    return trace
}

function emptyColumns(): Record<TraceChannel, number[]> {
    const columns = {} as Record<TraceChannel, number[]>
    for (const channel of TRACE_CHANNELS) columns[channel] = []
    return columns
}

function brakeAt(fraction: number): number {
    let brake = 0
    for (const zone of BRAKE_ZONES) {
        const distance = Math.abs(fraction - zone)
        if (distance < 0.04) brake = Math.max(brake, 1 - distance / 0.04)
    }
    return brake
}

function groundAt(fraction: number): { x: number; z: number } {
    const scaled = fraction * GROUND.length
    const index = Math.min(GROUND.length - 1, Math.floor(scaled))
    const local = scaled - index
    const from = GROUND[index]
    const to = GROUND[(index + 1) % GROUND.length]
    return {
        x: from[0] + (to[0] - from[0]) * local,
        z: from[1] + (to[1] - from[1]) * local,
    }
}

function clockMs(clock: Clock): number | null {
    return clock === null ? null : milliseconds(clock)
}


function milliseconds(clock: string): number {
    const [body, fraction] = clock.split(".")
    if (!body || fraction?.length !== 3) {
        throw new Error(`Expected m:ss.sss or ss.sss, received ${clock}`)
    }
    const pieces = body.split(":").map(part => Number(part))
    if (pieces.some(part => !Number.isInteger(part))) {
        throw new Error(`Expected m:ss.sss or ss.sss, received ${clock}`)
    }
    const seconds = pieces.length === 2 ? pieces[0] * 60 + pieces[1] : pieces[0]
    return seconds * 1000 + Number(fraction)
}

function localTime(now: number, hours: number, minutes: number): number {
    const date = new Date(now)
    date.setHours(hours, minutes, 0, 0)
    return date.getTime()
}

function shiftDays(at: number, days: number): number {
    const date = new Date(at)
    date.setDate(date.getDate() + days)
    return date.getTime()
}
