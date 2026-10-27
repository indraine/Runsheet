import type { Application } from "pixi.js"
import { onCleanup } from "solid-js"

/**
 * Keep a Pixi canvas on its host's layout box.
 *
 * The resize plugin only listens to `window` `resize`. Footer scale changes
 * the document through CSS zoom and does not emit that event, so the canvas
 * would keep the previous pixel size and paint outside the panel.
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
            const width = host.clientWidth
            const height = host.clientHeight
            const canvas = app.canvas
            if (width < 2 || height < 2) {
                if (canvas instanceof HTMLCanvasElement) {
                    canvas.style.width = `${width}px`
                    canvas.style.height = `${height}px`
                }
                return
            }
            app.renderer.resize(width, height)
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
