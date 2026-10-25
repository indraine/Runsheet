import { createSignal } from "solid-js"

const SCALE_KEY = "runsheet.scale"

export const UI_SCALES = [80, 90, 100, 110, 120, 130, 140, 150] as const

export type UiScale = (typeof UI_SCALES)[number]

const DEFAULT_SCALE: UiScale = 100

export const isUiScale = (value: number): value is UiScale =>
    (UI_SCALES as readonly number[]).includes(value)

export const parseScale = (stored: string | null): UiScale => {
    const value = Number(stored)
    return isUiScale(value) ? value : DEFAULT_SCALE
}

export const nextScale = (current: UiScale, direction: -1 | 1): UiScale => {
    const index = UI_SCALES.indexOf(current) + direction
    if (index < 0) return UI_SCALES[0]
    if (index >= UI_SCALES.length) return UI_SCALES[UI_SCALES.length - 1]
    return UI_SCALES[index]
}

const readScale = (): UiScale => {
    if (typeof localStorage === "undefined") return DEFAULT_SCALE
    try {
        return parseScale(localStorage.getItem(SCALE_KEY))
    } catch {
        return DEFAULT_SCALE
    }
}

const applyScale = (scale: UiScale): void => {
    const root = document.documentElement
    if (scale === DEFAULT_SCALE) {
        root.style.zoom = ""
        root.style.width = ""
        root.style.height = ""
        return
    }
    const zoom = scale / 100
    root.style.zoom = String(zoom)
    root.style.width = `${100 / zoom}vw`
    root.style.height = `${100 / zoom}dvh`
}

const [uiScale, setUiScaleSignal] = createSignal<UiScale>(readScale())

export const setUiScale = (scale: UiScale): void => {
    setUiScaleSignal(scale)
    try {
        localStorage.setItem(SCALE_KEY, String(scale))
    } catch {
    }
    if (typeof document !== "undefined") applyScale(scale)
}

export const zoomBy = (direction: -1 | 1): void => {
    setUiScale(nextScale(uiScale(), direction))
}

export { uiScale }

if (typeof document !== "undefined") applyScale(uiScale())
