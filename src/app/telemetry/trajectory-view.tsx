import { Application, Graphics } from "pixi.js"
import { RotateCcw } from "lucide-solid"
import {
    createEffect,
    createSignal,
    onCleanup,
    onMount,
    untrack,
} from "solid-js"
import { fitFrame, type GroundPoint, type GroundSeries } from "~/app/fit-ground"
import { ensurePlotSize, followPlotBox, plotResolution } from "~/app/plot-frame"
import { uiScale } from "~/app/scale"
import { cssColor } from "~/app/telemetry/css-color"
import {
    guardPointerCapture,
    popupBlocksCanvas,
    releaseHeldPointer,
} from "~/app/telemetry/pointer-capture"
import { layoutPoint, layoutTravel } from "~/app/zoom-space"
import { downsampleIndices, sampleAtDistance } from "~/app/telemetry/sample"
import {
    cursorIsProgrammatic,
    readStoredMapView,
    writeStoredMapView,
} from "~/app/telemetry/view-memory"
import {
    FOLLOW_REACH_M,
    followScale,
    windowRadius,
} from "~/app/telemetry/trajectory-camera"
import { themeGeneration } from "~/app/theme"
import { boundariesFor } from "~/app/track-catalog"
import { asphaltPolygon } from "~/app/track-geometry"
import {
    applySimilarity,
    placeOnTrack,
    type Placement,
    type PlanarPoint,
    type Similarity,
} from "~/app/track-surface"
import type { Trace } from "~/domain"
import { t } from "~/i18n"
import { Button, cn } from "~/ui"

const PADDING = 2
const MAX_POINTS = 900
const CAR_RADIUS = 4
const MIN_ZOOM = 1
const FALLBACK_FOLLOW = 8
const MIN_BIAS = 0.45
const MAX_BIAS = 8
const MAX_ZOOM = 96
const FALLBACK_LAP_A = 0xea580c
const FALLBACK_LAP_B = 0x2563eb
const FALLBACK_MUTED = 0x94a3b8
const FALLBACK_EDGE = 0x475569
const FALLBACK_SURFACE = 0xffffff

export type TrajectoryLine = {
    id: string
    label: string
    trace: Trace
    role: "primary" | "reference"
}

type HitPoint = {
    x: number
    y: number
    distance: number
}

export const TrajectoryView = (props: {
    track?: string
    lines: readonly TrajectoryLine[]
    cursorM: number
    onCursor?: (distanceM: number) => void
    registerZoom?: (zoom: ((factor: number) => void) | undefined) => void
    class?: string
}) => {
    let host: HTMLDivElement | undefined
    let pixi: Application | undefined
    let fitScale = () => {}
    let asphalt: Graphics | undefined
    let edges: Graphics | undefined
    let paths: Graphics | undefined
    let marker: Graphics | undefined
    const savedMap = readStoredMapView()
    let disposed = false
    let ready = false
    let follow = savedMap?.following ?? true
    let followBias = clamp(savedMap?.followBias ?? 1, MIN_BIAS, MAX_BIAS)
    let publishedZoom = FALLBACK_FOLLOW
    let seenCursor: number | undefined
    let cursorFromMap = false
    let camera = { x: 0, y: 0 }
    let gesture: { x: number; y: number; moved: boolean } | undefined
    let lastPointer = { x: 0, y: 0 }
    let placement: Placement | undefined
    let hitPoints: HitPoint[] = []

    const [zoom, setZoom] = createSignal(
        clamp(savedMap?.zoom ?? MIN_ZOOM, MIN_ZOOM, MAX_ZOOM)
    )
    const [pan, setPan] = createSignal(
        savedMap ? { x: savedMap.panX, y: savedMap.panY } : { x: 0, y: 0 }
    )
    const [following, setFollowing] = createSignal(follow)
    const [shownZoom, setShownZoom] = createSignal(FALLBACK_FOLLOW)

    const rememberMap = () => {
        const offset = pan()
        writeStoredMapView({
            following: follow,
            followBias,
            zoom: zoom(),
            panX: offset.x,
            panY: offset.y,
        })
    }

    const publishZoom = (scale: number) => {
        if (Math.abs(publishedZoom - scale) < 0.05) return
        publishedZoom = scale
        setShownZoom(scale)
    }

    const resetView = () => {
        follow = false
        followBias = 1
        setFollowing(false)
        setZoom(MIN_ZOOM)
        setPan({ x: 0, y: 0 })
    }

    const zoomBy = (factor: number, originX?: number, originY?: number) => {
        if (follow) {
            const next = clamp(followBias * factor, MIN_BIAS, MAX_BIAS)
            if (next === followBias) return
            followBias = next
            rememberMap()
            redraw()
            return
        }
        const view = host
        const prev = zoom()
        const next = clamp(prev * factor, MIN_ZOOM, MAX_ZOOM)
        if (next === prev) return
        if (view && originX !== undefined && originY !== undefined) {
            const local = layoutPoint(view, originX, originY)
            const localX = local.x
            const localY = local.y
            const centerX = view.clientWidth / 2
            const centerY = view.clientHeight / 2
            const current = pan()
            const ratio = next / prev
            setPan({
                x: localX - centerX - (localX - centerX - current.x) * ratio,
                y: localY - centerY - (localY - centerY - current.y) * ratio,
            })
        } else if (next <= MIN_ZOOM) {
            setPan({ x: 0, y: 0 })
        }
        setZoom(next)
    }

    const redraw = () => {
        const view = host
        const app = pixi
        const fill = asphalt
        const border = edges
        const lines = paths
        const car = marker
        if (!ready || !view || !app || !fill || !border || !lines || !car)
            return
        const box = ensurePlotSize(app, view)
        if (!box || box.width < 16 || box.height < 16) return

        fill.clear()
        border.clear()
        lines.clear()
        car.clear()
        hitPoints = []

        const { width, height } = box

        const colors = {
            lapA: cssColor("--lap-a", FALLBACK_LAP_A),
            lapB: cssColor("--lap-b", FALLBACK_LAP_B),
            muted: cssColor("--muted", FALLBACK_MUTED),
            edge: cssColor("--secondary", FALLBACK_EDGE),
            surface: cssColor("--surface", FALLBACK_SURFACE),
        }
        const roleColor = (role: TrajectoryLine["role"]): number =>
            role === "primary" ? colors.lapA : colors.lapB

        const bounds = props.track ? boundariesFor(props.track) : undefined
        const primary = props.lines.find(line => line.role === "primary")
        const fit = resolveFit(bounds?.center, props.track, primary, placement)
        if (fit.placement) placement = fit.placement

        const series: GroundSeries[] = []
        const kinds: ("asphalt" | "outer" | "inner" | "line" | "car")[] = []
        const matched = fit.similarity != null

        if (bounds && matched) {
            series.push(asGround(asphaltPolygon(bounds)))
            kinds.push("asphalt")
            series.push(asGround(bounds.left))
            kinds.push("outer")
            series.push(asGround(bounds.right))
            kinds.push("inner")
        }

        const lineMeta: {
            role: TrajectoryLine["role"]
            distances: number[]
        }[] = []
        for (const line of props.lines) {
            const placed = placedTrace(line.trace, fit.similarity)
            series.push(placed.ground)
            kinds.push("line")
            lineMeta.push({ role: line.role, distances: placed.distances })
        }

        const carLines: TrajectoryLine[] = []
        for (const line of props.lines) {
            const tip = sampleAtDistance(line.trace, props.cursorM)
            if (!tip) continue
            const point = projectPoint({ x: tip.x, y: tip.z }, fit.similarity)
            series.push(asGround([point]))
            kinds.push("car")
            carLines.push(line)
        }

        const frame =
            bounds != null && matched
                ? [asGround(bounds.left), asGround(bounds.right)]
                : series.filter((_, index) => kinds[index] === "line")
        const fitted = fitFrame(series, width, height, PADDING, frame)
        const centerX = width / 2
        const centerY = height / 2
        const aim = midpoint(carAims(fitted, kinds))
        const radius =
            aim === undefined
                ? 0
                : windowRadius(
                      cursorSamples(fitted, kinds, lineMeta),
                      props.cursorM,
                      FOLLOW_REACH_M,
                      aim
                  )
        const closeZoom =
            radius > 0 ? followScale(radius, width, height) : FALLBACK_FOLLOW
        const scale = follow
            ? clamp(closeZoom * followBias, MIN_ZOOM, MAX_ZOOM)
            : zoom()
        const offset =
            follow && aim ? followPan(aim, centerX, centerY, scale) : pan()
        camera = offset
        publishZoom(scale)
        const transform = (point: GroundPoint): GroundPoint => ({
            x: (point.x - centerX) * scale + centerX + offset.x,
            y: (point.y - centerY) * scale + centerY + offset.y,
        })

        for (let index = 0; index < kinds.length; index += 1) {
            const kind = kinds[index]
            const points = (fitted[index] ?? []).map(transform)
            if (kind === "asphalt" && points.length >= 3) {
                polygon(fill, points, colors.muted, 0.28)
            }
            if (kind === "outer" || kind === "inner") {
                stroke(border, points, 1.25, colors.edge, true)
            }
        }

        let lineIndex = 0
        for (let index = 0; index < kinds.length; index += 1) {
            if (kinds[index] !== "line") continue
            const meta = lineMeta[lineIndex]
            const line = props.lines[lineIndex]
            lineIndex += 1
            if (!line || !meta) continue
            const screen = (fitted[index] ?? []).map(transform)
            stroke(
                lines,
                screen,
                line.role === "primary" ? 2.5 : 2,
                roleColor(line.role),
                false,
                line.role === "primary" ? 1 : 0.8
            )
            if (line.role === "primary") {
                for (let point = 0; point < screen.length; point += 1) {
                    const at = screen[point]
                    const distance = meta.distances[point]
                    if (!at || distance === undefined) continue
                    hitPoints.push({ x: at.x, y: at.y, distance })
                }
            }
        }

        let carIndex = 0
        for (let index = 0; index < kinds.length; index += 1) {
            if (kinds[index] !== "car") continue
            const line = carLines[carIndex]
            carIndex += 1
            const at = fitted[index]?.[0]
            if (!at || !line) continue
            const mapped = transform(at)
            car.circle(mapped.x, mapped.y, CAR_RADIUS + 2)
            car.fill({ color: colors.surface })
            car.circle(mapped.x, mapped.y, CAR_RADIUS)
            car.fill({ color: roleColor(line.role) })
        }
        app.render()
    }

    const scrubFromPointer = (clientX: number, clientY: number) => {
        if (!props.onCursor || hitPoints.length === 0 || !host) return
        const local = layoutPoint(host, clientX, clientY)
        const x = local.x
        const y = local.y
        let best = hitPoints[0]
        let bestDelta = Infinity
        for (const point of hitPoints) {
            const delta = (point.x - x) ** 2 + (point.y - y) ** 2
            if (delta < bestDelta) {
                bestDelta = delta
                best = point
            }
        }
        if (best) {
            cursorFromMap = true
            props.onCursor(best.distance)
            cursorFromMap = false
        }
    }

    onMount(() => {
        const view = host
        if (!view) return

        const app = new Application()
        pixi = app
        const fit = followPlotBox(app, view, redraw, () => ready)
        fitScale = fit
        props.registerZoom?.(factor => zoomBy(factor))

        const onWheel = (event: WheelEvent) => {
            event.preventDefault()
            const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
            zoomBy(factor, event.clientX, event.clientY)
        }
        const onPointerDown = (event: PointerEvent) => {
            if (popupBlocksCanvas()) return
            if (zoom() <= MIN_ZOOM) {
                scrubFromPointer(event.clientX, event.clientY)
                return
            }
            gesture = { x: event.clientX, y: event.clientY, moved: false }
            lastPointer = { x: event.clientX, y: event.clientY }
            view.setPointerCapture(event.pointerId)
        }
        const onPointerMove = (event: PointerEvent) => {
            const pending = gesture
            if (!pending) {
                if (!follow) scrubFromPointer(event.clientX, event.clientY)
                return
            }
            const travel = layoutTravel(
                view,
                event.clientX - lastPointer.x,
                event.clientY - lastPointer.y
            )
            const dx = travel.x
            const dy = travel.y
            if (!pending.moved) {
                const travel = Math.hypot(
                    event.clientX - pending.x,
                    event.clientY - pending.y
                )
                if (travel < 4) return
                pending.moved = true
                follow = false
                setFollowing(false)
                setZoom(publishedZoom)
                setPan({ x: camera.x + dx, y: camera.y + dy })
                lastPointer = { x: event.clientX, y: event.clientY }
                return
            }
            lastPointer = { x: event.clientX, y: event.clientY }
            setPan(current => ({ x: current.x + dx, y: current.y + dy }))
        }
        const onPointerUp = (event: PointerEvent) => {
            const pending = gesture
            gesture = undefined
            if (pending?.moved) rememberMap()
            else if (pending) scrubFromPointer(event.clientX, event.clientY)
            if (view.hasPointerCapture(event.pointerId)) {
                releaseHeldPointer(view, event.pointerId)
            }
        }
        const onDoubleClick = () => resetView()

        view.addEventListener("wheel", onWheel, { passive: false })
        view.addEventListener("pointerdown", onPointerDown)
        view.addEventListener("pointermove", onPointerMove)
        view.addEventListener("pointerup", onPointerUp)
        view.addEventListener("pointercancel", onPointerUp)
        view.addEventListener("dblclick", onDoubleClick)
        const releasePointer = guardPointerCapture(view, () => {
            gesture = undefined
        })

        void app
            .init({
                resizeTo: view,
                backgroundAlpha: 0,
                antialias: true,
                autoDensity: true,
                resolution: plotResolution(),
                preference: "webgl",
            })
            .then(() => {
                if (disposed) {
                    app.destroy(true, true)
                    return
                }
                asphalt = new Graphics()
                edges = new Graphics()
                paths = new Graphics()
                marker = new Graphics()
                app.stage.addChild(asphalt, edges, paths, marker)
                view.appendChild(app.canvas)
                ready = true
                fit()
            })
            .catch(() => {})

        onCleanup(() => {
            disposed = true
            releasePointer()
            props.registerZoom?.(undefined)
            view.removeEventListener("wheel", onWheel)
            view.removeEventListener("pointerdown", onPointerDown)
            view.removeEventListener("pointermove", onPointerMove)
            view.removeEventListener("pointerup", onPointerUp)
            view.removeEventListener("pointercancel", onPointerUp)
            view.removeEventListener("dblclick", onDoubleClick)
            if (!ready) return
            ready = false
            app.destroy(true, true)
            asphalt = undefined
            edges = undefined
            paths = undefined
            marker = undefined
        })
    })

    createEffect(() => {
        const cursor = props.cursorM
        const cursorMoved = seenCursor !== undefined && cursor !== seenCursor
        seenCursor = cursor
        zoom()
        pan()
        props.track
        for (const line of props.lines) {
            line.trace.x
            line.trace.z
            line.trace.distance
            line.role
        }
        themeGeneration()
        if (
            cursorMoved &&
            !cursorFromMap &&
            !gesture &&
            !cursorIsProgrammatic()
        ) {
            follow = true
            setFollowing(true)
        }
        redraw()
    })

    createEffect(() => {
        uiScale()
        fitScale()
    })

    createEffect(() => {
        following()
        zoom()
        untrack(rememberMap)
    })

    return (
        <div class={cn("relative h-full w-full", props.class)}>
            <div
                ref={element => {
                    host = element
                }}
                class="h-full w-full touch-none overflow-hidden cursor-crosshair"
                role="img"
                aria-label={t("app.telemetryTrajectory")}
            />
            <div class="absolute right-2 bottom-2 flex gap-1">
                <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t("app.telemetryZoomOut")}
                    disabled={shownZoom() <= MIN_ZOOM + 0.05}
                    onClick={() => zoomBy(1 / 1.25)}
                >
                    −
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t("app.telemetryZoomReset")}
                    disabled={
                        !following() &&
                        zoom() === MIN_ZOOM &&
                        pan().x === 0 &&
                        pan().y === 0
                    }
                    onClick={resetView}
                >
                    <RotateCcw class="size-3.5" strokeWidth={1.75} />
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t("app.telemetryZoomIn")}
                    disabled={shownZoom() >= MAX_ZOOM - 0.05}
                    onClick={() => zoomBy(1.25)}
                >
                    +
                </Button>
            </div>
        </div>
    )
}

const cursorSamples = (
    fitted: readonly GroundPoint[][],
    kinds: readonly string[],
    metas: readonly { distances: number[]; role: TrajectoryLine["role"] }[]
): { x: number; y: number; distance: number }[] => {
    const samples: { x: number; y: number; distance: number }[] = []
    let lineIndex = 0
    for (let index = 0; index < kinds.length; index += 1) {
        if (kinds[index] !== "line") continue
        const meta = metas[lineIndex]
        lineIndex += 1
        if (!meta || meta.role !== "primary") continue
        const points = fitted[index] ?? []
        for (let point = 0; point < points.length; point += 1) {
            const at = points[point]
            const distance = meta.distances[point]
            if (!at || distance === undefined) continue
            samples.push({ x: at.x, y: at.y, distance })
        }
    }
    return samples
}

const followPan = (
    aim: GroundPoint,
    centerX: number,
    centerY: number,
    scale: number
): { x: number; y: number } => ({
    x: -(aim.x - centerX) * scale,
    y: -(aim.y - centerY) * scale,
})

const carAims = (
    fitted: readonly GroundPoint[][],
    kinds: readonly string[]
): GroundPoint[] => {
    const aims: GroundPoint[] = []
    for (let index = 0; index < kinds.length; index += 1) {
        if (kinds[index] !== "car") continue
        const at = fitted[index]?.[0]
        if (at) aims.push(at)
    }
    return aims
}

const midpoint = (points: readonly GroundPoint[]): GroundPoint | undefined => {
    if (points.length === 0) return undefined
    let x = 0
    let y = 0
    for (const point of points) {
        x += point.x
        y += point.y
    }
    return { x: x / points.length, y: y / points.length }
}

const resolveFit = (
    center: readonly PlanarPoint[] | undefined,
    track: string | undefined,
    primary: TrajectoryLine | undefined,
    previous: Placement | undefined
): { placement?: Placement; similarity?: Similarity } => {
    if (!center || !track || !primary) return {}
    const driven = tracePlanar(primary.trace)
    const next = placeOnTrack(center, track, primary.id, driven, previous)
    if (next.status !== "matched") return { placement: next }
    return { placement: next, similarity: next.fit }
}

const placedTrace = (
    trace: Trace,
    similarity: Similarity | undefined
): { ground: GroundSeries; distances: number[] } => {
    const count = Math.min(
        trace.x.length,
        trace.z.length,
        trace.distance.length
    )
    const indices = downsampleIndices(count, MAX_POINTS)
    const x = new Float32Array(indices.length)
    const z = new Float32Array(indices.length)
    const distances: number[] = []
    for (let index = 0; index < indices.length; index += 1) {
        const source = indices[index]
        const point = projectPoint(
            { x: trace.x[source] ?? 0, y: trace.z[source] ?? 0 },
            similarity
        )
        x[index] = point.x
        z[index] = point.y
        distances.push(trace.distance[source] ?? 0)
    }
    return { ground: { x, z }, distances }
}

const projectPoint = (
    point: PlanarPoint,
    similarity: Similarity | undefined
): PlanarPoint => (similarity ? applySimilarity(point, similarity) : point)

const tracePlanar = (trace: Trace): PlanarPoint[] => {
    const count = Math.min(trace.x.length, trace.z.length)
    const points: PlanarPoint[] = []
    const indices = downsampleIndices(count, MAX_POINTS)
    for (const index of indices) {
        const x = trace.x[index]
        const y = trace.z[index]
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        points.push({ x, y })
    }
    return points
}

const asGround = (
    points: readonly { x: number; y: number }[]
): GroundSeries => ({
    x: Float32Array.from(points, point => point.x),
    z: Float32Array.from(points, point => point.y),
})

const polygon = (
    graphics: Graphics,
    points: readonly GroundPoint[],
    color: number,
    alpha: number
) => {
    if (points.length < 3) return
    graphics.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y)
    }
    graphics.closePath()
    graphics.fill({ color, alpha })
}

const stroke = (
    graphics: Graphics,
    points: readonly GroundPoint[],
    width: number,
    color: number,
    closed: boolean,
    alpha = 1
) => {
    if (points.length < 2) return
    graphics.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y)
    }
    if (closed) graphics.closePath()
    graphics.stroke({ width, color, alpha, cap: "round", join: "round" })
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))
