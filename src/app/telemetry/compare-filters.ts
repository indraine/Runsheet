import { localDayStart, type Session } from "~/domain"

export type CompareChoice = {
    session: Session
}

export type CompareFilter = {
    track: string
    drivers: readonly string[]
    dayStart: number | null
    query: string
}

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
