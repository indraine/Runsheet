import { createSignal } from "solid-js"

export type HomePane = "left" | "right"

export type HomeExpanded = HomePane | "none"

export type HomeLayout = {
    split: number
    expanded: HomeExpanded
}

export const DEFAULT_SPLIT = 0.5

export const MIN_SPLIT = 0.25

export const MAX_SPLIT = 0.75

const LAYOUT_KEY = "runsheet.home-layout"

export const DEFAULT_LAYOUT: HomeLayout = {
    split: DEFAULT_SPLIT,
    expanded: "none",
}

export const clampSplit = (value: number): number => {
    if (!Number.isFinite(value)) return DEFAULT_SPLIT
    return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value))
}

const isExpanded = (value: unknown): value is HomeExpanded =>
    value === "left" || value === "right" || value === "none"

export const parseHomeLayout = (stored: string | null): HomeLayout => {
    if (!stored) return DEFAULT_LAYOUT
    let parsed: unknown
    try {
        parsed = JSON.parse(stored)
    } catch {
        return DEFAULT_LAYOUT
    }
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_LAYOUT
    const { split, expanded } = parsed as Record<string, unknown>
    return {
        split: typeof split === "number" ? clampSplit(split) : DEFAULT_SPLIT,
        expanded: isExpanded(expanded) ? expanded : "none",
    }
}

export const toggleExpanded = (
    current: HomeExpanded,
    pane: HomePane
): HomeExpanded => (current === pane ? "none" : pane)

const readLayout = (): HomeLayout => {
    if (typeof localStorage === "undefined") return DEFAULT_LAYOUT
    try {
        return parseHomeLayout(localStorage.getItem(LAYOUT_KEY))
    } catch {
        return DEFAULT_LAYOUT
    }
}

const [homeLayout, setHomeLayoutSignal] = createSignal<HomeLayout>(readLayout())

export { homeLayout }

const storeLayout = (layout: HomeLayout): void => {
    setHomeLayoutSignal(layout)
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
    }
}

export const setHomeSplit = (split: number): void => {
    storeLayout({ ...homeLayout(), split: clampSplit(split) })
}

export const resetHomeSplit = (): void => {
    setHomeSplit(DEFAULT_SPLIT)
}

export const toggleHomePane = (pane: HomePane): void => {
    const layout = homeLayout()
    storeLayout({ ...layout, expanded: toggleExpanded(layout.expanded, pane) })
}

export const showRightPane = (): void => {
    const layout = homeLayout()
    if (layout.expanded !== "left") return
    storeLayout({ ...layout, expanded: "none", split: DEFAULT_SPLIT })
}
