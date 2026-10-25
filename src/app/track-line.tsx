import { Application, Graphics } from "pixi.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import { fitFrame, type GroundPoint, type GroundSeries } from "~/app/fit-ground"
import { theme } from "~/app/theme"
import { boundariesFor } from "~/app/track-catalog"
import {
    applySimilarity,
    placeOnTrack,
    type Placement,
    type PlanarPoint,
    shouldReusePlacement,
    type TrackBoundaries,
} from "~/app/track-surface"
import type { Trace } from "~/domain"
import { t } from "~/i18n"
import { cn } from "~/ui"

const PADDING = 16
const ROAD_WIDTH = 5
const ROAD_OUTLINE = 1
const CAR_RADIUS = 5
const CAR_RING = 2
const FALLBACK_ACCENT = 0x2a6fc9
const FALLBACK_EDGE = 0x475569
const FALLBACK_FILL = 0x94a3b8
const FALLBACK_SURFACE = 0xffffff


export const TrackLine = (props: {
    track?: string
    road?: Trace
    car?: Trace
    class?: string
}) => {
    let host: HTMLDivElement | undefined
    let roadGraphics: Graphics | undefined
    let carGraphics: Graphics | undefined
    let placement: Placement | undefined
    let disposed = false
    let ready = false

    const redraw = () => {
        const view = host
        const road = roadGraphics
        const car = carGraphics
        if (!ready || !view || !road || !car) return

        road.clear()
        car.clear()

        const bounds = props.track ? boundariesFor(props.track) : undefined
        placement = resolvePlacement(
            bounds,
            props.track,
            props.road ?? props.car,
            placement
        )
        const laid = bounds
            ? layoutCatalog(bounds, placement, props.car, view)
            : layoutTrace(props.road, props.car, view)

        const edge = cssColor("--secondary", FALLBACK_EDGE)
        const fill = cssColor("--muted", FALLBACK_FILL)
        strokeRoad(
            road,
            laid.road,
            ROAD_WIDTH + ROAD_OUTLINE * 2,
            edge,
            laid.closed
        )
        strokeRoad(road, laid.road, ROAD_WIDTH, fill, laid.closed)
        if (laid.car) {
            drawCar(car, laid.car, {
                fill: cssColor("--accent", FALLBACK_ACCENT),
                ring: cssColor("--surface", FALLBACK_SURFACE),
            })
        }
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
                carGraphics = new Graphics()
                app.stage.addChild(roadGraphics, carGraphics)
                view.appendChild(app.canvas)
                ready = true
                redraw()
            })
            .catch(() => {})

        onCleanup(() => {
            disposed = true
            observer.disconnect()
            if (!ready) return
            ready = false
            app.destroy(true, true)
            roadGraphics = undefined
            carGraphics = undefined
        })
    })

    createEffect(() => {
        props.track
        props.road?.x
        props.road?.z
        props.road?.lapId
        props.car?.x
        props.car?.z
        props.car?.lapId
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

type TrackLayout = {
    road: GroundPoint[]
    car: GroundPoint | undefined
    closed: boolean
}

type Viewport = { clientWidth: number; clientHeight: number }


const layoutCatalog = (
    bounds: TrackBoundaries,
    placement: Placement | undefined,
    car: Trace | undefined,
    view: Viewport
): TrackLayout => {
    const center = asGround(bounds.center)
    const tip = car ? lastPoint(car) : undefined
    const fit = placement?.status === "matched" ? placement.fit : undefined
    const placed = tip && fit ? applySimilarity(tip, fit) : undefined
    const series = placed ? [center, asGround([placed])] : [center]
    const fitted = fitFrame(
        series,
        view.clientWidth,
        view.clientHeight,
        PADDING,
        [center]
    )
    return { road: fitted[0] ?? [], car: fitted[1]?.[0], closed: true }
}


const layoutTrace = (
    road: Trace | undefined,
    car: Trace | undefined,
    view: Viewport
): TrackLayout => {
    const roadSeries = { x: road?.x ?? [], z: road?.z ?? [] }
    const tip = car ? lastPoint(car) : undefined
    const series = tip ? [roadSeries, asGround([tip])] : [roadSeries]
    const frame = roadSeries.x.length > 0 ? [roadSeries] : series
    const fitted = fitFrame(
        series,
        view.clientWidth,
        view.clientHeight,
        PADDING,
        frame
    )
    return { road: fitted[0] ?? [], car: fitted[1]?.[0], closed: false }
}

const resolvePlacement = (
    bounds: TrackBoundaries | undefined,
    track: string | undefined,
    anchor: Trace | undefined,
    previous: Placement | undefined
): Placement | undefined => {
    if (!bounds || !track) return undefined
    const lapId = anchor?.lapId ?? ""
    const samples = anchor ? Math.min(anchor.x.length, anchor.z.length) : 0
    if (shouldReusePlacement(previous, track, lapId, samples)) return previous
    return placeOnTrack(
        bounds.center,
        track,
        lapId,
        tracePlanar(anchor?.x ?? [], anchor?.z ?? []),
        previous
    )
}

const tracePlanar = (
    x: ArrayLike<number>,
    z: ArrayLike<number>
): PlanarPoint[] => {
    const count = Math.min(x.length, z.length)
    const points: PlanarPoint[] = []
    for (let index = 0; index < count; index += 1) {
        const pointX = x[index]
        const pointY = z[index]
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) continue
        points.push({ x: pointX, y: pointY })
    }
    return points
}

const lastPoint = (trace: Trace): PlanarPoint | undefined => {
    for (
        let index = Math.min(trace.x.length, trace.z.length) - 1;
        index >= 0;
        index -= 1
    ) {
        const x = trace.x[index]
        const y = trace.z[index]
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
    }
    return undefined
}

const asGround = (points: readonly PlanarPoint[]): GroundSeries => ({
    x: Float32Array.from(points, point => point.x),
    z: Float32Array.from(points, point => point.y),
})

const strokeRoad = (
    graphics: Graphics,
    points: readonly GroundPoint[],
    width: number,
    color: number,
    closed: boolean
) => {
    if (points.length < 2) return
    graphics.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y)
    }
    if (closed) graphics.closePath()
    graphics.stroke({ width, color, cap: "round", join: "round" })
}

const drawCar = (
    graphics: Graphics,
    at: GroundPoint,
    colors: { fill: number; ring: number }
) => {
    graphics.circle(at.x, at.y, CAR_RADIUS + CAR_RING)
    graphics.fill({ color: colors.ring })
    graphics.circle(at.x, at.y, CAR_RADIUS)
    graphics.fill({ color: colors.fill })
}

const cssColor = (name: string, fallback: number): number => {
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return Number.parseInt(raw.slice(1), 16)
    return fallback
}
