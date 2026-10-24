import { createSignal } from "solid-js"

export type AccLink = {
    linked: boolean
    presence: "unknown" | "off" | "menu" | "session"
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

const [analysisHeading, setAnalysisHeading] = createSignal<AnalysisHeading>({
    track: null,
    car: null,
})

export { accLink, analysisHeading, setAccLink, setAnalysisHeading }
