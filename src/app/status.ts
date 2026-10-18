import { createSignal } from "solid-js"

/** Строка связи. Её заполняет событие `acc-status`. */
export type AccLink = {
    linked: boolean
    /**
     * `unknown`, пока первый статус не пришёл.
     * Дальше `off`, `menu` или `session`.
     */
    presence: "unknown" | "off" | "menu" | "session"
    hz: number | null
    packetId: number | null
    /** Id открытой сессии. Пока ACC её не прислала — null, и на листе остаётся сид. */
    sessionId: string | null
}

/** Track and car in the analysis header. Null until a lap is loaded. */
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
