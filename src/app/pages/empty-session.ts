import type { Lap, Session } from "~/domain"

export type PastEntry = { session: Session; laps: readonly Lap[] }

/**
 * A closed session with no laps at all is not an outing worth listing.
 *
 * Online ACC switches to the race session while the car still waits in the
 * pits or the menu after qualifying; that row ends without a single lap.
 */
export const hasRecordedLaps = (entry: PastEntry): boolean =>
    entry.laps.length > 0
