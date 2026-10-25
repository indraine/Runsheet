import { createSignal } from "solid-js"

export type AccPresence = "unknown" | "off" | "menu" | "inPits" | "onTrack"

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

export { accLink, accPresence, analysisHeading, setAccLink, setAnalysisHeading }
