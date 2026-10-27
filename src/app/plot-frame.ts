import type { Application } from "pixi.js"
import { onCleanup } from "solid-js"
import { documentZoom } from "~/app/zoom-space"

const MAX_DEVICE_PIXELS = 2

/**
 * Backing-store density for a canvas that CSS zoom will stretch.
 *
 * The canvas CSS box is in layout pixels. Zoom then scales that bitmap, so
 * the buffer has to carry `devicePixelRatio * zoom` or the picture softens
 * as the footer scale rises. `devicePixelRatio` 2 and zoom 1.5 => 3.
 */
export const plotResolutionFor = (
    devicePixelRatio: number,
    zoom: number
): number => {
    const pixels = devicePixelRatio > 0 ? devicePixelRatio : 1
    const scale = zoom > 0 ? zoom : 1
    return Math.min(pixels, MAX_DEVICE_PIXELS) * scale
}

export const plotResolution = (): number =>
    plotResolutionFor(window.devicePixelRatio || 1, documentZoom())

export type PlotBox = { width: number; height: number }

/**
 * Layout size of the host.
 *
 * `clientWidth` is the CSS box. Under document zoom a transient layout pass
 * can report 0 while `getBoundingClientRect` still has the previous box, so
 * fall back to that rect divided by zoom.
 */
export const measurePlotBox = (host: HTMLElement): PlotBox | undefined => {
    if (host.clientWidth >= 2 && host.clientHeight >= 2) {
        return { width: host.clientWidth, height: host.clientHeight }
    }
    const rect = host.getBoundingClientRect()
    const zoom = documentZoom()
    const width = rect.width / zoom
    const height = rect.height / zoom
    if (width < 2 || height < 2) return undefined
    return { width, height }
}

/**
 * Make the canvas CSS box match the host. A 0×0 style sticks after a swap
 * reflow, because the host size itself did not change and nothing else resizes.
 */
export const ensurePlotSize = (
    app: Application,
    host: HTMLElement
): PlotBox | undefined => {
    const box = measurePlotBox(host)
    if (!box) return undefined
    const canvas = app.canvas
    if (!(canvas instanceof HTMLCanvasElement)) return box
    const sized =
        Math.abs(canvas.clientWidth - box.width) < 1 &&
        Math.abs(canvas.clientHeight - box.height) < 1
    if (!sized) app.renderer.resize(box.width, box.height, plotResolution())
    return box
}

/**
 * Keep a Pixi canvas on its host's layout box, sharp at the current zoom.
 *
 * The resize plugin only listens to `window` `resize`. Footer scale changes
 * the document through CSS zoom and does not emit that event.
 *
 * Call from `onMount` before init resolves. `ready` gates the resize until
 * the stage exists. Invoke the returned function after init and whenever
 * `uiScale` changes.
 */
export const followPlotBox = (
    app: Application,
    host: HTMLElement,
    redraw: () => void,
    ready: () => boolean
): (() => void) => {
    let frame = 0
    const fit = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
            if (!ready()) return
            if (!ensurePlotSize(app, host)) return
            redraw()
        })
    }
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    onCleanup(() => {
        cancelAnimationFrame(frame)
        observer.disconnect()
    })
    return fit
}
