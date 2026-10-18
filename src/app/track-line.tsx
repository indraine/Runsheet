import { Application, Graphics } from "pixi.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import { fitGround } from "~/app/fit-ground"
import { theme } from "~/app/theme"
import type { Trace } from "~/domain"
import { t } from "~/i18n"
import { cn } from "~/ui"

const PADDING = 16
const FALLBACK_ACCENT = 0x2a6fc9

/**
 * Линия проезда по каналам `x`/`z`.
 * На разборе сюда добавятся эталон и курсор; на таймлайне рисуется один круг.
 */
export const TrackLine = (props: { trace: Trace; class?: string }) => {
    let host: HTMLDivElement | undefined
    let application: Application | undefined
    let graphics: Graphics | undefined
    let disposed = false
    let ready = false

    const redraw = () => {
        const app = application
        const line = graphics
        const view = host
        if (!ready || !app || !line || !view) return

        const points = fitGround(
            props.trace.x,
            props.trace.z,
            view.clientWidth,
            view.clientHeight,
            PADDING
        )
        line.clear()
        if (points.length < 2) return

        line.moveTo(points[0].x, points[0].y)
        for (let index = 1; index < points.length; index += 1) {
            line.lineTo(points[index].x, points[index].y)
        }
        line.stroke({
            width: 2.5,
            color: accentColor(),
            cap: "round",
            join: "round",
        })
    }

    onMount(() => {
        const view = host
        if (!view) return

        const app = new Application()
        application = app
        const observer = new ResizeObserver(() => redraw())
        observer.observe(view)

        void app
            .init({
                resizeTo: view,
                backgroundAlpha: 0,
                antialias: true,
                autoDensity: true,
                resolution: Math.min(window.devicePixelRatio || 1, 2),
                preference: "webgl",
            })
            .then(() => {
                if (disposed) {
                    app.destroy(true, true)
                    return
                }
                graphics = new Graphics()
                app.stage.addChild(graphics)
                view.appendChild(app.canvas)
                ready = true
                redraw()
            })
            .catch(() => {
                /* холст недоступен — карточка остаётся без линии */
            })

        onCleanup(() => {
            disposed = true
            observer.disconnect()
            if (!ready) return
            ready = false
            app.destroy(true, true)
            application = undefined
            graphics = undefined
        })
    })

    createEffect(() => {
        props.trace.x
        props.trace.z
        theme()
        redraw()
    })

    return (
        <div
            ref={element => {
                host = element
            }}
            class={cn("h-full min-h-72 w-full", props.class)}
            role="img"
            aria-label={t("app.trackLine")}
        />
    )
}

const accentColor = (): number => {
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim()
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return Number.parseInt(raw.slice(1), 16)
    return FALLBACK_ACCENT
}
