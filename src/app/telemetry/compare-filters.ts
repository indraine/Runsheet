import { localDayStart, type Session } from "~/domain"

export type CompareChoice = {
    session: Session
}

export type CompareFilter = {
    track: string
    /**
     * Selected driver nicks. Empty means every driver on the track.
     * Use `""` for sessions with an empty driver string.
     */
    drivers: readonly string[]
    /** Local day start ms, or `null` for every day. */
    dayStart: number | null
    /** Case-insensitive match against driver and car code. */
    query: string
}

/**
 * Unique driver names for sessions on a track (sorted, empty nick last).
 *
 * @example
 * driversOnTrack([{ session: { track: "monza", driver: "A" } }], "monza")
 */
export const driversOnTrack = (
    choices: readonly CompareChoice[],
    track: string
): string[] => {
    const seen = new Set<string>()
    for (const choice of choices) {
        if (choice.session.track !== track) continue
        seen.add(choice.session.driver)
    }
    return [...seen].sort((left, right) => {
        if (left === "") return 1
        if (right === "") return -1
        return left.localeCompare(right)
    })
}

/**
 * Apply track / driver / day / text filters. Track is required; empty drivers
 * or a null day keep those dimensions open.
 *
 * @example
 * filterChoices(choices, { track: "monza", drivers: [], dayStart: null, query: "" })
 */
export const filterChoices = <T extends CompareChoice>(
    choices: readonly T[],
    filter: CompareFilter
): T[] => {
    if (!filter.track) return []
    const query = filter.query.trim().toLowerCase()
    const drivers =
        filter.drivers.length === 0 ? null : new Set(filter.drivers)

    return choices.filter(choice => {
        const session = choice.session
        if (session.track !== filter.track) return false
        if (drivers && !drivers.has(session.driver)) return false
        if (
            filter.dayStart !== null &&
            localDayStart(session.startedAt) !== filter.dayStart
        ) {
            return false
        }
        if (query.length > 0 && !matchesQuery(session, query)) return false
        return true
    })
}

/** Toggle a driver in a multi-select chip set. */
export const toggleDriver = (
    selected: readonly string[],
    driver: string
): string[] => {
    if (selected.includes(driver)) {
        return selected.filter(item => item !== driver)
    }
    return [...selected, driver]
}

const matchesQuery = (session: Session, query: string): boolean => {
    const driver = session.driver.toLowerCase()
    const car = session.car.toLowerCase()
    return driver.includes(query) || car.includes(query)
}
