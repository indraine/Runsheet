import { Application, Graphics } from "pixi.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import {
    fitFrame,
    followFrame,
    followPixelsPerMeter,
    type GroundPoint,
    type GroundSeries,
} from "~/app/fit-ground"
import { theme } from "~/app/theme"
import { boundariesFor } from "~/app/track-catalog"
import {
    applySimilarity,
    placeOnTrack,
    type Placement,
    type PlanarPoint,
    shouldReusePlacement,
    type Similarity,
    type TrackBoundaries,
} from "~/app/track-surface"
import type { Trace } from "~/domain"
import { t } from "~/i18n"
import { cn } from "~/ui"

const PADDING = 16
const ROAD_EDGE = 18
const ROAD_FILL = 11
const SCHEMATIC_WIDTH = 5
const SCHEMATIC_OUTLINE = 1
/** Сколько метров трассы видно от машины до верхнего края. */
const FOLLOW_AHEAD_M = 90
/** Ширина полотна, если в каталоге трассы её нет. Типичный трек ACC. */
const TRACK_WIDTH_M = 12
const EDGE_WIDTH = 1.5
/** Край короче этого — ширины в каталоге нет, край совпал с осью. */
const MIN_EDGE_M = 0.5
const LINE_WIDTH = 1.5
const FALLBACK_ACCENT = 0x2a6fc9
const FALLBACK_EDGE = 0x475569
const FALLBACK_FILL = 0x94a3b8

export const TrackLine = (props: {
    track?: string
    road?: Trace
    line?: Trace
    view?: "overview" | "follow"
    class?: string
}) => {
    let host: HTMLDivElement | undefined
    let roadGraphics: Graphics | undefined
    let lineGraphics: Graphics | undefined
    let carGraphics: Graphics | undefined
    let placement: Placement | undefined
    let disposed = false
    let ready = false

    const redraw = () => {
        const view = host
        const road = roadGraphics
        const line = lineGraphics
        const car = carGraphics
        if (!ready || !view || !road || !line || !car) return

        const edge = cssColor("--secondary", FALLBACK_EDGE)
        const fill = cssColor("--muted", FALLBACK_FILL)
        const accent = cssColor("--accent", FALLBACK_ACCENT)
        const anchor = props.road ?? props.line
        const bounds = props.track ? boundariesFor(props.track) : undefined
        placement = resolvePlacement(bounds, props.track, anchor, placement)

        road.clear()
        line.clear()
        car.clear()

        if (bounds) {
            const fit =
                placement?.status === "matched" ? placement.fit : undefined
            const projected =
                fit && props.line ? projectGround(props.line, fit) : undefined
            const laid = layoutTrack(
                bounds,
                projected,
                view.clientWidth,
                view.clientHeight,
                props.view === "follow"
            )
            if (laid.metersToPixels === undefined) {
                strokeClosed(
                    road,
                    laid.center,
                    SCHEMATIC_WIDTH + SCHEMATIC_OUTLINE * 2,
                    edge
                )
                strokeClosed(road, laid.center, SCHEMATIC_WIDTH, fill)
            } else if (laid.edges) {
                fillAsphalt(road, laid.edges.left, laid.edges.right, fill)
                strokeClosed(road, laid.edges.left, EDGE_WIDTH, edge)
                strokeClosed(road, laid.edges.right, EDGE_WIDTH, edge)
            } else {
                const width = TRACK_WIDTH_M * laid.metersToPixels
                strokeClosed(road, laid.center, width + EDGE_WIDTH * 2, edge)
                strokeClosed(road, laid.center, width, fill)
            }
            if (projected) {
                strokePath(line, laid.line, LINE_WIDTH, accent)
                drawCar(car, laid.line, accent)
            }
            return
        }

        const roadSeries = {
            x: props.road?.x ?? [],
            z: props.road?.z ?? [],
        }
        const lineSeries = {
            x: props.line?.x ?? [],
            z: props.line?.z ?? [],
        }
        const followed =
            props.view === "follow"
                ? followFrame(
                      [roadSeries, lineSeries],
                      view.clientWidth,
                      view.clientHeight,
                      FOLLOW_AHEAD_M
                  )
                : undefined
        const [roadPoints, linePoints] =
            followed ??
            fitFrame(
                [roadSeries, lineSeries],
                view.clientWidth,
                view.clientHeight,
                PADDING
            )
        const fillWidth = followed
            ? TRACK_WIDTH_M *
              followPixelsPerMeter(view.clientHeight, FOLLOW_AHEAD_M)
            : ROAD_FILL
        const outerWidth = followed
            ? fillWidth + EDGE_WIDTH * 2
            : ROAD_EDGE
        strokePath(road, roadPoints, outerWidth, edge)
        strokePath(road, roadPoints, fillWidth, fill)
        strokePath(line, linePoints, LINE_WIDTH, accent)
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
        props.track
        props.road?.x
        props.road?.z
        props.road?.lapId
        props.line?.x
        props.line?.z
        props.line?.lapId
        props.view
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
        anchor?.lapId ?? "",
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

const projectGround = (trace: Trace, fit: Similarity): GroundSeries => {
    const count = Math.min(trace.x.length, trace.z.length)
    const x = new Float32Array(count)
    const z = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
        const point = applySimilarity(
            { x: trace.x[index], y: trace.z[index] },
            fit
        )
        x[index] = point.x
        z[index] = point.y
    }
    return { x, z }
}

const asGround = (points: readonly PlanarPoint[]): GroundSeries => ({
    x: Float32Array.from(points, point => point.x),
    z: Float32Array.from(points, point => point.y),
})

/** `metersToPixels` есть только в режиме «за машиной»: там полотно в реальном масштабе. */
type TrackLayout = {
    center: GroundPoint[]
    line: GroundPoint[]
    edges?: { left: GroundPoint[]; right: GroundPoint[] }
    metersToPixels?: number
}

const layoutTrack = (
    bounds: TrackBoundaries,
    projected: GroundSeries | undefined,
    width: number,
    height: number,
    follow: boolean
): TrackLayout => {
    const center = asGround(bounds.center)
    if (follow && projected) {
        const followed = followFrame(
            [center, asGround(bounds.left), asGround(bounds.right), projected],
            width,
            height,
            FOLLOW_AHEAD_M
        )
        if (followed) {
            return {
                center: followed[0] ?? [],
                line: followed[3] ?? [],
                edges: hasEdges(bounds)
                    ? { left: followed[1] ?? [], right: followed[2] ?? [] }
                    : undefined,
                metersToPixels: followPixelsPerMeter(height, FOLLOW_AHEAD_M),
            }
        }
    }

    const series = projected ? [center, projected] : [center]
    const fitted = fitFrame(series, width, height, PADDING, [center])
    return {
        center: fitted[0] ?? [],
        line: fitted[1] ?? [],
    }
}

const hasEdges = (bounds: TrackBoundaries): boolean =>
    bounds.left.some((point, index) => {
        const middle = bounds.center[index]
        return (
            middle !== undefined &&
            Math.hypot(point.x - middle.x, point.y - middle.y) > MIN_EDGE_M
        )
    })

/** Полотно — четырёхугольники между соседними точками левого и правого края. */
const fillAsphalt = (
    graphics: Graphics,
    left: readonly GroundPoint[],
    right: readonly GroundPoint[],
    color: number
) => {
    const count = Math.min(left.length, right.length)
    if (count < 2) return
    for (let index = 0; index < count; index += 1) {
        const next = (index + 1) % count
        graphics.poly(
            [
                left[index].x,
                left[index].y,
                left[next].x,
                left[next].y,
                right[next].x,
                right[next].y,
                right[index].x,
                right[index].y,
            ],
            true
        )
    }
    graphics.fill({ color })
}

const strokeClosed = (
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
    graphics.closePath()
    graphics.stroke({ width, color, cap: "round", join: "round" })
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
