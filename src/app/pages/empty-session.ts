import type { Lap, Session } from "~/domain"

export type PastEntry = { session: Session; laps: readonly Lap[] }

export const hasRecordedLaps = (entry: PastEntry): boolean =>
    entry.laps.length > 0
