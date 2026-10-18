import { Application, Graphics } from "pixi.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import { fitFrame, type GroundPoint } from "~/app/fit-ground"
import { theme } from "~/app/theme"
import type { Trace } from "~/domain"
import { t } from "~/i18n"
import { cn } from "~/ui"

const PADDING = 16
const ROAD_EDGE = 18
const ROAD_FILL = 11
const LINE_WIDTH = 2.5
const FALLBACK_ACCENT = 0x2a6fc9
const FALLBACK_EDGE = 0x475569
const FALLBACK_FILL = 0x94a3b8

/**
 * Карта трассы: дорога, поверх неё линия текущего круга и машина в последней точке.
 * Дорога и линия делят одну рамку, поэтому новый круг не сдвигает трассу.
 */
export const TrackLine = (props: {
    road?: Trace
    line?: Trace
    class?: string
}) => {
    let host: HTMLDivElement | undefined
    let roadGraphics: Graphics | undefined
    let lineGraphics: Graphics | undefined
    let carGraphics: Graphics | undefined
    let disposed = false
    let ready = false

    const redraw = () => {
        const view = host
        const road = roadGraphics
        const line = lineGraphics
        const car = carGraphics
        if (!ready || !view || !road || !line || !car) return

        const [roadPoints, linePoints] = fitFrame(
            [
                { x: props.road?.x ?? [], z: props.road?.z ?? [] },
                { x: props.line?.x ?? [], z: props.line?.z ?? [] },
            ],
            view.clientWidth,
            view.clientHeight,
            PADDING
        )
        const edge = cssColor("--secondary", FALLBACK_EDGE)
        const fill = cssColor("--muted", FALLBACK_FILL)
        const accent = cssColor("--accent", FALLBACK_ACCENT)

        road.clear()
        strokePath(road, roadPoints, ROAD_EDGE, edge)
        strokePath(road, roadPoints, ROAD_FILL, fill)

        line.clear()
        strokePath(line, linePoints, LINE_WIDTH, accent)

        car.clear()
        drawCar(car, linePoints, accent)
    }

    onMount(() => {
        const view = host
        if (!view) return

        const app = new Application()
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
                roadGraphics = new Graphics()
                lineGraphics = new Graphics()
                carGraphics = new Graphics()
                app.stage.addChild(roadGraphics, lineGraphics, carGraphics)
                view.appendChild(app.canvas)
                ready = true
                redraw()
            })
            .catch(() => {
                /* холст недоступен — карточка остаётся без карты */
            })

        onCleanup(() => {
            disposed = true
            observer.disconnect()
            if (!ready) return
            ready = false
            app.destroy(true, true)
            roadGraphics = undefined
            lineGraphics = undefined
            carGraphics = undefined
        })
    })

    createEffect(() => {
        props.road?.x
        props.road?.z
        props.line?.x
        props.line?.z
        props.line?.lapId
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

const strokePath = (
    graphics: Graphics,
    points: readonly GroundPoint[],
    width: number,
    color: number
) => {
    if (points.length < 2) return
    graphics.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y)
    }
    graphics.stroke({ width, color, cap: "round", join: "round" })
}

/** Машина сверху: нос по направлению двух последних точек линии. */
const drawCar = (
    graphics: Graphics,
    points: readonly GroundPoint[],
    color: number
) => {
    const tip = points[points.length - 1]
    if (!tip) return
    const prev = points.length >= 2 ? points[points.length - 2] : undefined
    const angle = prev
        ? Math.atan2(tip.y - prev.y, tip.x - prev.x)
        : -Math.PI / 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const at = (along: number, side: number): GroundPoint => ({
        x: tip.x + cos * along - sin * side,
        y: tip.y + sin * along + cos * side,
    })
    const nose = at(9, 0)
    const frontLeft = at(3, 5)
    const rearLeft = at(-7, 5)
    const tail = at(-8, 0)
    const rearRight = at(-7, -5)
    const frontRight = at(3, -5)
    graphics.moveTo(nose.x, nose.y)
    graphics.lineTo(frontLeft.x, frontLeft.y)
    graphics.lineTo(rearLeft.x, rearLeft.y)
    graphics.lineTo(tail.x, tail.y)
    graphics.lineTo(rearRight.x, rearRight.y)
    graphics.lineTo(frontRight.x, frontRight.y)
    graphics.closePath()
    graphics.fill({ color })
}

const cssColor = (name: string, fallback: number): number => {
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return Number.parseInt(raw.slice(1), 16)
    return fallback
}
