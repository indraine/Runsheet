const CHANNEL_KEY = "runsheet.telemetry-channels"

export const ANALYSIS_CHANNELS = [
    "speed",
    "throttle",
    "brake",
    "steer",
    "gear",
    "rpm",
    "delta",
] as const

export type AnalysisChannel = (typeof ANALYSIS_CHANNELS)[number]

export type ChannelLayout = {
    order: AnalysisChannel[]
    hidden: AnalysisChannel[]
}

const DEFAULT_ORDER: AnalysisChannel[] = [...ANALYSIS_CHANNELS]

/**
 * Visible analysis channels in draw order.
 *
 * @example
 * ```ts
 * visibleChannels({ order: ["speed", "delta"], hidden: ["delta"] })
 * // ["speed"]
 * ```
 */
export const visibleChannels = (
    layout: ChannelLayout
): AnalysisChannel[] =>
    layout.order.filter(channel => !layout.hidden.includes(channel))

/**
 * Parse a stored channel drawer payload.
 *
 * @example
 * ```ts
 * parseChannelLayout('{"order":["speed"],"hidden":[]}')
 * // { order: ["speed", ...defaults], hidden: [] }
 * ```
 */
export const parseChannelLayout = (
    raw: string | null
): ChannelLayout => {
    if (!raw) return defaultLayout()
    let value: unknown
    try {
        value = JSON.parse(raw)
    } catch {
        return defaultLayout()
    }
    if (!isRecord(value)) return defaultLayout()
    const order = sanitizeOrder(value.order)
    const hidden = sanitizeHidden(value.hidden, order)
    return { order, hidden }
}

export const readChannelLayout = (): ChannelLayout => {
    if (typeof localStorage === "undefined") return defaultLayout()
    try {
        return parseChannelLayout(localStorage.getItem(CHANNEL_KEY))
    } catch {
        return defaultLayout()
    }
}

export const writeChannelLayout = (layout: ChannelLayout): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.setItem(
            CHANNEL_KEY,
            JSON.stringify({
                order: sanitizeOrder(layout.order),
                hidden: sanitizeHidden(layout.hidden, layout.order),
            })
        )
    } catch {
        // Private mode still keeps the in-memory drawer.
    }
}

export const toggleChannel = (
    layout: ChannelLayout,
    channel: AnalysisChannel
): ChannelLayout => {
    const hidden = layout.hidden.includes(channel)
        ? layout.hidden.filter(item => item !== channel)
        : [...layout.hidden, channel]
    // Keep at least one chart so the page never goes blank.
    if (hidden.length >= layout.order.length) return layout
    return { ...layout, hidden }
}

const defaultLayout = (): ChannelLayout => ({
    order: [...DEFAULT_ORDER],
    hidden: ["gear", "rpm", "delta"],
})

const sanitizeOrder = (value: unknown): AnalysisChannel[] => {
    const seen = new Set<AnalysisChannel>()
    const order: AnalysisChannel[] = []
    if (Array.isArray(value)) {
        for (const item of value) {
            if (!isChannel(item) || seen.has(item)) continue
            seen.add(item)
            order.push(item)
        }
    }
    for (const channel of DEFAULT_ORDER) {
        if (seen.has(channel)) continue
        order.push(channel)
    }
    return order
}

const sanitizeHidden = (
    value: unknown,
    order: readonly AnalysisChannel[]
): AnalysisChannel[] => {
    if (!Array.isArray(value)) return defaultLayout().hidden
    const allowed = new Set(order)
    const hidden: AnalysisChannel[] = []
    for (const item of value) {
        if (!isChannel(item) || !allowed.has(item) || hidden.includes(item)) {
            continue
        }
        hidden.push(item)
    }
    if (hidden.length >= order.length) {
        return hidden.slice(0, Math.max(0, order.length - 1))
    }
    return hidden
}

const isChannel = (value: unknown): value is AnalysisChannel =>
    typeof value === "string" &&
    (ANALYSIS_CHANNELS as readonly string[]).includes(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null
