import { createSignal } from "solid-js"
import type { LiveClock } from "~/ipc/status"

export type AccPresence = "unknown" | "off" | "menu" | "inPits" | "onTrack" | "pause"

export type AccLink = {
    linked: boolean
    presence: AccPresence
    hz: number | null
    packetId: number | null
    sessionId: string | null
}

export type AnalysisHeading = {
    track: string | null
    car: string | null
}

const [liveClock, setLiveClock] = createSignal<LiveClock>()

/** Keep the live card still when a status tick repeats the same clock. */
export const publishLiveClock = (next: LiveClock | undefined): void => {
    if (sameClock(liveClock(), next)) return
    setLiveClock(next)
}

const sameClock = (
    left: LiveClock | undefined,
    right: LiveClock | undefined
): boolean => {
    if (left === right) return true
    if (!left || !right) return false
    return (
        left.sessionId === right.sessionId &&
        left.lapMs === right.lapMs &&
        left.sectorMs === right.sectorMs &&
        left.sector === right.sector &&
        left.s1Ms === right.s1Ms &&
        left.s2Ms === right.s2Ms &&
        left.outlap === right.outlap
    )
}

const [accLink, setAccLink] = createSignal<AccLink>({
    linked: false,
    presence: "unknown",
    hz: null,
    packetId: null,
    sessionId: null,
})

const [accPresence, setAccPresence] = createSignal<AccPresence>("unknown")

const [analysisHeading, setAnalysisHeading] = createSignal<AnalysisHeading>({
    track: null,
    car: null,
})

const painters = new Set<(presence: AccPresence) => void>()

export const paintAccPresence = (
    paint: (presence: AccPresence) => void
): (() => void) => {
    painters.add(paint)
    paint(accPresence())
    return () => {
        painters.delete(paint)
    }
}

export const applyAccLink = (next: AccLink): void => {
    if (next.presence !== accPresence()) {
        for (const paint of painters) paint(next.presence)
    }
    setAccPresence(next.presence)
    setAccLink(next)
}

export {
    accLink,
    accPresence,
    analysisHeading,
    liveClock,
    setAccLink,
    setAnalysisHeading,
}
