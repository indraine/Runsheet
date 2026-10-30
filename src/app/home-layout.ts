import { createSignal } from "solid-js"

export type HomePane = "left" | "right"

/** Which pane fills the whole page, or `none` for the split view. */
export type HomeExpanded = HomePane | "none"

export type HomeLayout = {
    /** Share of the page width the right pane takes in the split view. */
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

/**
 * Keep a split inside the range where both panes stay usable. Anything that is
 * not a finite number gives the default.
 *
 * clampSplit(0.9) -> 0.75
 */
export const clampSplit = (value: number): number => {
    if (!Number.isFinite(value)) return DEFAULT_SPLIT
    return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value))
}

const isExpanded = (value: unknown): value is HomeExpanded =>
    value === "left" || value === "right" || value === "none"

/**
 * Layout from a stored JSON object. A broken value, or a broken field of it,
 * falls back to the default for that field.
 *
 * parseHomeLayout('{"split":0.4,"expanded":"left"}')
 *   -> { split: 0.4, expanded: "left" }
 */
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

/**
 * The pane to expand when `pane` is toggled: the same pane again restores the
 * split view.
 */
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
        // The choice still holds until the window closes.
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
