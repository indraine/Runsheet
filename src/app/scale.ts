import { createSignal } from "solid-js"

const SCALE_KEY = "runsheet.scale"

/** Stored in place of a number while the scale follows the window width. */
const AUTO_VALUE = "auto"

export const SCALE_MIN = 80
export const SCALE_MAX = 200
export const SCALE_STEP = 10
export const DEFAULT_SCALE = 100

export const isUiScale = (value: number): boolean =>
    Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX

/** Window width, in CSS pixels, up to which the interface keeps 100%. */
export const AUTO_BASE_WIDTH = 1920

/**
 * Scale for a window width. Up to the base width nothing changes; wider
 * windows grow the interface in steps of 10%, up to the maximum.
 *
 * autoScale(1440) -> 100, autoScale(2560) -> 130, autoScale(3840) -> 200
 */
export const autoScale = (width: number): number => {
    if (!Number.isFinite(width) || width <= AUTO_BASE_WIDTH) {
        return DEFAULT_SCALE
    }
    const stepped =
        Math.round(((width / AUTO_BASE_WIDTH) * 100) / SCALE_STEP) * SCALE_STEP
    return Math.min(SCALE_MAX, Math.max(DEFAULT_SCALE, stepped))
}

/**
 * Stored choice: a number of percent is a manual scale, anything else
 * (nothing stored, "auto", broken value) follows the window width.
 *
 * parseScale("120") -> 120, parseScale(null) -> undefined
 */
export const parseScale = (stored: string | null): number | undefined => {
    if (stored === null || stored === AUTO_VALUE) return undefined
    const value = Number(stored)
    return isUiScale(value) ? value : undefined
}

export const clampScale = (value: number): number => {
    const rounded = Math.round(value)
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, rounded))
}

export const nextScale = (current: number, direction: -1 | 1): number =>
    clampScale(current + direction * SCALE_STEP)

const windowWidth = (): number =>
    typeof window === "undefined" ? AUTO_BASE_WIDTH : window.innerWidth

const readManual = (): number | undefined => {
    if (typeof localStorage === "undefined") return undefined
    try {
        return parseScale(localStorage.getItem(SCALE_KEY))
    } catch {
        return undefined
    }
}

const applyScale = (scale: number): void => {
    const root = document.documentElement
    const zoom = scale / 100
    // Fixed layers and viewport units are sized before zoom, then scaled again.
    // Overlays divide by this variable so they stay inside the window.
    root.style.setProperty("--ui-zoom", String(zoom))
    if (scale === DEFAULT_SCALE) {
        root.style.zoom = ""
        root.style.width = ""
        root.style.height = ""
        return
    }
    root.style.zoom = String(zoom)
    root.style.width = `${100 / zoom}vw`
    root.style.height = `${100 / zoom}dvh`
}

const initialManual = readManual()

const [manualScale, setManualScale] = createSignal<number | undefined>(
    initialManual
)

const [uiScale, setUiScaleSignal] = createSignal(
    initialManual ?? autoScale(windowWidth())
)

/** True while the scale follows the window width. */
export const isAutoScale = (): boolean => manualScale() === undefined

const show = (scale: number): void => {
    setUiScaleSignal(scale)
    if (typeof document !== "undefined") applyScale(scale)
}

export const setUiScale = (scale: number): void => {
    const next = clampScale(scale)
    setManualScale(next)
    try {
        localStorage.setItem(SCALE_KEY, String(next))
    } catch {}
    show(next)
}

/** Back to the scale that follows the window width. */
export const resetUiScale = (): void => {
    setManualScale(undefined)
    try {
        localStorage.setItem(SCALE_KEY, AUTO_VALUE)
    } catch {}
    show(autoScale(windowWidth()))
}

export const zoomBy = (direction: -1 | 1): void => {
    setUiScale(nextScale(uiScale(), direction))
}

export { uiScale }

if (typeof document !== "undefined") applyScale(uiScale())

if (typeof window !== "undefined") {
    let frame = 0
    window.addEventListener("resize", () => {
        if (!isAutoScale()) return
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
            const next = autoScale(windowWidth())
            if (next !== uiScale()) show(next)
        })
    })
}
