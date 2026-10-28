const LIVE_KEY = "runsheet.live-card-layout"

export const LIVE_BLOCKS = ["summary", "laps", "map"] as const

export type LiveBlock = (typeof LIVE_BLOCKS)[number]

export type LiveLayout = {
    order: LiveBlock[]
    hidden: LiveBlock[]
}

/**
 * Visible live-card blocks in draw order.
 *
 * @example
 * ```ts
 * visibleLiveBlocks({ order: ["summary", "map"], hidden: [] })
 * // ["summary", "map"]
 * ```
 */
export const visibleLiveBlocks = (layout: LiveLayout): LiveBlock[] =>
    layout.order.filter(block => !layout.hidden.includes(block))

export const parseLiveLayout = (raw: string | null): LiveLayout => {
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

export const readLiveLayout = (): LiveLayout => {
    if (typeof localStorage === "undefined") return defaultLayout()
    try {
        return parseLiveLayout(localStorage.getItem(LIVE_KEY))
    } catch {
        return defaultLayout()
    }
}

export const writeLiveLayout = (layout: LiveLayout): void => {
    if (typeof localStorage === "undefined") return
    try {
        localStorage.setItem(
            LIVE_KEY,
            JSON.stringify({
                order: sanitizeOrder(layout.order),
                hidden: sanitizeHidden(layout.hidden, layout.order),
            })
        )
    } catch {
        // Private mode still keeps the in-memory layout.
    }
}

/**
 * Move a block one step earlier or later in the order.
 *
 * @example
 * ```ts
 * moveLiveBlock({ order: ["summary", "laps", "map"], hidden: [] }, "laps", 1)
 * // { order: ["summary", "map", "laps"], hidden: [] }
 * ```
 */
export const moveLiveBlock = (
    layout: LiveLayout,
    block: LiveBlock,
    delta: -1 | 1
): LiveLayout => {
    const index = layout.order.indexOf(block)
    if (index < 0) return layout
    const next = index + delta
    if (next < 0 || next >= layout.order.length) return layout
    const order = [...layout.order]
    const [item] = order.splice(index, 1)
    order.splice(next, 0, item)
    return { ...layout, order }
}

export const toggleLiveBlock = (
    layout: LiveLayout,
    block: LiveBlock
): LiveLayout => {
    const hidden = layout.hidden.includes(block)
        ? layout.hidden.filter(item => item !== block)
        : [...layout.hidden, block]
    if (hidden.length >= layout.order.length) return layout
    return { ...layout, hidden }
}

const defaultLayout = (): LiveLayout => ({
    order: [...LIVE_BLOCKS],
    hidden: [],
})

const sanitizeOrder = (value: unknown): LiveBlock[] => {
    const seen = new Set<LiveBlock>()
    const order: LiveBlock[] = []
    if (Array.isArray(value)) {
        for (const item of value) {
            if (!isBlock(item) || seen.has(item)) continue
            seen.add(item)
            order.push(item)
        }
    }
    for (const block of LIVE_BLOCKS) {
        if (seen.has(block)) continue
        order.push(block)
    }
    return order
}

const sanitizeHidden = (
    value: unknown,
    order: readonly LiveBlock[]
): LiveBlock[] => {
    if (!Array.isArray(value)) return []
    const allowed = new Set(order)
    const hidden: LiveBlock[] = []
    for (const item of value) {
        if (!isBlock(item) || !allowed.has(item) || hidden.includes(item)) {
            continue
        }
        hidden.push(item)
    }
    if (hidden.length >= order.length) {
        return hidden.slice(0, Math.max(0, order.length - 1))
    }
    return hidden
}

const isBlock = (value: unknown): value is LiveBlock =>
    typeof value === "string" && (LIVE_BLOCKS as readonly string[]).includes(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null
