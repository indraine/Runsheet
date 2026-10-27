import { createSignal } from "solid-js"

const SCALE_KEY = "runsheet.scale"

export const SCALE_MIN = 80
export const SCALE_MAX = 150
export const SCALE_STEP = 10
export const DEFAULT_SCALE = 100

export const isUiScale = (value: number): boolean =>
    Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX

export const parseScale = (stored: string | null): number => {
    const value = Number(stored)
    return isUiScale(value) ? value : DEFAULT_SCALE
}

export const clampScale = (value: number): number => {
    const rounded = Math.round(value)
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, rounded))
}

export const nextScale = (current: number, direction: -1 | 1): number =>
    clampScale(current + direction * SCALE_STEP)

const readScale = (): number => {
    if (typeof localStorage === "undefined") return DEFAULT_SCALE
    try {
        return parseScale(localStorage.getItem(SCALE_KEY))
    } catch {
        return DEFAULT_SCALE
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

const [uiScale, setUiScaleSignal] = createSignal(readScale())

export const setUiScale = (scale: number): void => {
    const next = clampScale(scale)
    setUiScaleSignal(next)
    try {
        localStorage.setItem(SCALE_KEY, String(next))
    } catch {}
    if (typeof document !== "undefined") applyScale(next)
}

export const zoomBy = (direction: -1 | 1): void => {
    setUiScale(nextScale(uiScale(), direction))
}

export { uiScale }

if (typeof document !== "undefined") applyScale(uiScale())
