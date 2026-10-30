import { Application, Graphics } from "pixi.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import { ensurePlotSize, followPlotBox, plotResolution } from "~/app/plot-frame"
import { uiScale } from "~/app/scale"
import { cssColor } from "~/app/telemetry/css-color"
import { deltaAreas } from "~/app/telemetry/delta-fill"
import {
    lapColorFallback,
    lapColorVar,
} from "~/app/telemetry/lap-colors"
import {
    guardPointerCapture,
    popupBlocksCanvas,
} from "~/app/telemetry/pointer-capture"
import { layoutPoint } from "~/app/zoom-space"
import type { DistanceWindow, DivergenceZone } from "~/app/telemetry/divergence"
import {
    deltaToBaseline,
    distanceSpan,
    downsampleIndices,
} from "~/app/telemetry/sample"
import { themeGeneration } from "~/app/theme"
import type { Trace } from "~/domain"
import { cn } from "~/ui"

const PAD = { top: 10, right: 10, bottom: 8, left: 10 }
const MAX_POINTS = 720
const FALLBACK_INK = 0x0f172a
const FALLBACK_LINE = 0xe2e8f0

export type ChannelKind =
    | "throttle"
    | "brake"
    | "steer"
    | "speed"
    | "gear"
    | "rpm"
    | "delta"

export type ChannelTrace = {
    trace: Trace
    colorIndex: number
}

export const ChannelView = (props: {
    kind: ChannelKind
    /** First entry is the baseline. */
    traces?: readonly ChannelTrace[]
    cursorM: number
    onCursor: (distanceM: number) => void
    distanceWindow?: DistanceWindow
    zones?: readonly DivergenceZone[]
    activeZone?: DivergenceZone
    onZone?: (zone: DivergenceZone) => void
    onZoom?: (factor: number) => void
    class?: string
    label: string
}) => {
    let host: HTMLDivElement | undefined
    let pixi: Application | undefined
    let fitScale = () => {}
    let plot: Graphics | undefined
    let cursor: Graphics | undefined
    let disposed = false
    let ready = false

    const series = () => props.traces ?? []

    const span = () => {
        const focused = props.distanceWindow
        if (focused && focused.max > focused.min) return focused
        let min = Infinity
        let max = -Infinity
        for (const item of series()) {
            const next = distanceSpan(item.trace)
            if (!next) continue
            if (next.min < min) min = next.min
            if (next.max > max) max = next.max
        }
        if (!Number.isFinite(min) || max <= min) return undefined
        return { min, max }
    }

    const redraw = () => {
        const view = host
        const app = pixi
        const layer = plot
        const playhead = cursor
        if (!ready || !view || !app || !layer || !playhead) return
        const box = ensurePlotSize(app, view)
        if (!box) return

        layer.clear()
        playhead.clear()

        const { width, height } = box
        const innerW = width - PAD.left - PAD.right
        const innerH = height - PAD.top - PAD.bottom
        if (innerW < 8 || innerH < 8) return

        const range = span()
        if (!range || range.max <= range.min) return

        const ink = cssColor("--ink", FALLBACK_INK)
        const line = cssColor("--line", FALLBACK_LINE)
        const palette = series().map(item =>
            cssColor(lapColorVar(item.colorIndex), lapColorFallback(item.colorIndex))
        )

        drawZoneBands(
            layer,
            props.zones,
            props.activeZone,
            range,
            innerW,
            innerH,
            palette
        )
        drawChannel(
            layer,
            props.kind,
            series(),
            range,
            innerW,
            innerH,
            palette,
            line
        )

        const cursorX =
            PAD.left +
            ((clamp(props.cursorM, range.min, range.max) - range.min) /
                (range.max - range.min)) *
                innerW
        playhead.moveTo(cursorX, PAD.top)
        playhead.lineTo(cursorX, PAD.top + innerH)
        playhead.stroke({ width: 1.5, color: ink, alpha: 0.85 })
        app.render()
    }

    const distanceFromEvent = (clientX: number): number | undefined => {
        const view = host
        const range = span()
        if (!view || !range || range.max <= range.min) return undefined
        const localX = layoutPoint(view, clientX, 0).x
        const innerW = view.clientWidth - PAD.left - PAD.right
        if (innerW < 8) return undefined
        const ratio = clamp((localX - PAD.left) / innerW, 0, 1)
        return range.min + ratio * (range.max - range.min)
    }

    const zoneAt = (clientX: number): DivergenceZone | undefined => {
        const distance = distanceFromEvent(clientX)
        if (distance === undefined) return undefined
        return props.zones?.find(
            zone => distance >= zone.startM && distance <= zone.endM
        )
    }

    const scrub = (clientX: number) => {
        const distance = distanceFromEvent(clientX)
        if (distance !== undefined) props.onCursor(distance)
    }

    onMount(() => {
        const view = host
        if (!view) return

        const app = new Application()
        pixi = app
        const fit = followPlotBox(app, view, redraw, () => ready)
        fitScale = fit

        const onPointerMove = (event: PointerEvent) => {
            if (popupBlocksCanvas()) return
            scrub(event.clientX)
        }
        const onDoubleClick = (event: MouseEvent) => {
            const zone = zoneAt(event.clientX)
            if (zone) props.onZone?.(zone)
        }
        const onWheel = (event: WheelEvent) => {
            if (!props.onZoom || event.deltaY === 0) return
            event.preventDefault()
            props.onZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12)
        }

        view.addEventListener("pointermove", onPointerMove)
        view.addEventListener("pointerdown", onPointerMove)
        view.addEventListener("dblclick", onDoubleClick)
        view.addEventListener("wheel", onWheel, { passive: false })
        const releasePointer = guardPointerCapture(view)

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
                plot = new Graphics()
                cursor = new Graphics()
                app.stage.addChild(plot, cursor)
                view.appendChild(app.canvas)
                ready = true
                fit()
            })
            .catch(() => {})

        onCleanup(() => {
            disposed = true
            releasePointer()
            view.removeEventListener("pointermove", onPointerMove)
            view.removeEventListener("pointerdown", onPointerMove)
            view.removeEventListener("dblclick", onDoubleClick)
            view.removeEventListener("wheel", onWheel)
            if (!ready) return
            ready = false
            app.destroy(true, true)
            plot = undefined
            cursor = undefined
        })
    })

    createEffect(() => {
        props.kind
        for (const item of series()) {
            item.trace.lapId
            item.trace.distance
            item.trace.throttle
            item.trace.brake
            item.trace.steer
            item.trace.speed
            item.trace.gear
            item.trace.rpm
            item.trace.time
            item.colorIndex
        }
        props.cursorM
        props.distanceWindow?.min
        props.distanceWindow?.max
        props.zones
        props.activeZone?.startM
        props.activeZone?.endM
        themeGeneration()
        redraw()
    })

    createEffect(() => {
        uiScale()
        fitScale()
    })

    return (
        <div
            ref={element => {
                host = element
            }}
            class={cn(
                "h-full min-h-0 w-full touch-none overflow-hidden cursor-crosshair",
                props.class
            )}
            role="img"
            aria-label={props.label}
        />
    )
}

const drawChannel = (
    graphics: Graphics,
    kind: ChannelKind,
    traces: readonly ChannelTrace[],
    range: { min: number; max: number },
    innerW: number,
    innerH: number,
    palette: readonly number[],
    grid: number
) => {
    const yRange = valueRange(kind, traces, range)

    for (const fraction of [0, 0.5, 1]) {
        const y = PAD.top + innerH * (1 - fraction)
        graphics.moveTo(PAD.left, y)
        graphics.lineTo(PAD.left + innerW, y)
        graphics.stroke({ width: 1, color: grid, alpha: 0.7 })
    }

    const baseline = traces[0]?.trace
    const deltaSeries = new Map<number, { x: number; y: number }[]>()
    if (kind === "delta") {
        const ySpan = yRange.max - yRange.min
        const zeroY = PAD.top + innerH * (1 - (0 - yRange.min) / ySpan)
        // Fill between each curve and the zero line, then the zero line itself
        // in the baseline color: the baseline is the reference at zero.
        for (let index = traces.length - 1; index >= 1; index -= 1) {
            const item = traces[index]
            if (!item) continue
            const points = deltaPoints(
                item.trace,
                baseline,
                range,
                yRange,
                innerW,
                innerH
            )
            deltaSeries.set(index, points)
            const color = palette[index] ?? lapColorFallback(item.colorIndex)
            for (const area of deltaAreas(points, zeroY)) {
                graphics.poly(area.polygon)
                graphics.fill({
                    color,
                    alpha: traces.length > 2 ? 0.14 : 0.22,
                })
            }
        }
        const baselineItem = traces[0]
        graphics.moveTo(PAD.left, zeroY)
        graphics.lineTo(PAD.left + innerW, zeroY)
        graphics.stroke({
            width: 2,
            color:
                palette[0] ??
                (baselineItem
                    ? lapColorFallback(baselineItem.colorIndex)
                    : grid),
            alpha: 1,
        })
    }
    // Draw overlays first so the baseline stays on top.
    for (let index = traces.length - 1; index >= 0; index -= 1) {
        const item = traces[index]
        if (!item) continue
        if (kind === "delta" && index === 0) continue
        const points =
            kind === "delta"
                ? (deltaSeries.get(index) ?? [])
                : kind === "gear"
                  ? stepPoints(item.trace, range, yRange, innerW, innerH)
                  : seriesPoints(item.trace, kind, range, yRange, innerW, innerH)
        strokeSeries(
            graphics,
            points,
            palette[index] ?? lapColorFallback(item.colorIndex),
            index === 0 ? 1 : 0.85,
            index === 0 ? 2 : 1.5
        )
    }
}

const valueRange = (
    kind: ChannelKind,
    traces: readonly ChannelTrace[],
    range: { min: number; max: number }
): { min: number; max: number } => {
    if (kind === "throttle" || kind === "brake") return { min: 0, max: 1 }
    if (kind === "steer") return signedExtent(traces, "steer", range)
    if (kind === "gear") return gearRange(traces, range)
    if (kind === "delta") return deltaRange(traces, range)
    if (kind === "rpm") return paddedExtent(traces, "rpm", range, 1000)
    return paddedExtent(traces, "speed", range, 1)
}

const gearRange = (
    traces: readonly ChannelTrace[],
    range: { min: number; max: number }
): { min: number; max: number } => {
    let max = 1
    for (const item of traces) {
        visitChannel(item.trace, "gear", range, value => {
            if (value > max) max = value
        })
    }
    return { min: -1, max: Math.max(6, Math.ceil(max) + 0.5) }
}

const deltaRange = (
    traces: readonly ChannelTrace[],
    range: { min: number; max: number }
): { min: number; max: number } => {
    const baseline = traces[0]?.trace
    if (!baseline) return { min: -1000, max: 1000 }
    let extent = 0
    for (const item of traces.slice(1)) {
        visitDistances(item.trace, range, distance => {
            const delta = deltaToBaseline(item.trace, baseline, distance)
            if (delta === undefined) return
            const magnitude = Math.abs(delta)
            if (magnitude > extent) extent = magnitude
        })
    }
    if (extent < 200) extent = 200
    const pad = extent * 0.08
    return { min: -(extent + pad), max: extent + pad }
}

const signedExtent = (
    traces: readonly ChannelTrace[],
    channel: "steer",
    range: { min: number; max: number }
): { min: number; max: number } => {
    let extent = 0
    for (const item of traces) {
        visitChannel(item.trace, channel, range, value => {
            const magnitude = Math.abs(value)
            if (magnitude > extent) extent = magnitude
        })
    }
    if (extent < 1) extent = 1
    const pad = extent * 0.08
    return { min: -(extent + pad), max: extent + pad }
}

const paddedExtent = (
    traces: readonly ChannelTrace[],
    channel: "speed" | "rpm",
    range: { min: number; max: number },
    floor: number
): { min: number; max: number } => {
    let min = Infinity
    let max = -Infinity
    for (const item of traces) {
        visitChannel(item.trace, channel, range, value => {
            if (value < min) min = value
            if (value > max) max = value
        })
    }
    if (!Number.isFinite(min) || max <= min) return { min: 0, max: floor }
    const pad = Math.max((max - min) * 0.08, floor * 0.02)
    return { min: Math.max(0, min - pad), max: max + pad }
}

const visitChannel = (
    trace: Trace | undefined,
    channel: "steer" | "speed" | "gear" | "rpm",
    range: { min: number; max: number },
    visit: (value: number) => void
) => {
    if (!trace) return
    const count = Math.min(trace.distance.length, trace[channel].length)
    for (let index = 0; index < count; index += 1) {
        const distance = trace.distance[index]
        const value = trace[channel][index]
        if (!Number.isFinite(distance) || !Number.isFinite(value)) continue
        if (distance < range.min || distance > range.max) continue
        visit(value)
    }
}

const visitDistances = (
    trace: Trace,
    range: { min: number; max: number },
    visit: (distance: number) => void
) => {
    const count = trace.distance.length
    const indices = indicesInRange(trace.distance, count, range)
    for (const index of indices) {
        const distance = trace.distance[index]
        if (!Number.isFinite(distance)) continue
        visit(distance)
    }
}

const seriesPoints = (
    trace: Trace,
    kind: Exclude<ChannelKind, "delta" | "gear">,
    range: { min: number; max: number },
    yRange: { min: number; max: number },
    innerW: number,
    innerH: number
): { x: number; y: number }[] => {
    const channel = kind
    const count = Math.min(trace.distance.length, trace[channel].length)
    const indices = indicesInRange(trace.distance, count, range)
    const span = range.max - range.min
    const ySpan = yRange.max - yRange.min
    const points: { x: number; y: number }[] = []
    for (const index of indices) {
        const distance = trace.distance[index]
        const value = trace[channel][index]
        if (!Number.isFinite(distance) || !Number.isFinite(value)) continue
        const x = PAD.left + ((distance - range.min) / span) * innerW
        const ratio = clamp((value - yRange.min) / ySpan, 0, 1)
        const y = PAD.top + innerH * (1 - ratio)
        points.push({ x, y })
    }
    return points
}

/** Gear as a step line: hold value until the next sample. */
const stepPoints = (
    trace: Trace,
    range: { min: number; max: number },
    yRange: { min: number; max: number },
    innerW: number,
    innerH: number
): { x: number; y: number }[] => {
    const count = Math.min(trace.distance.length, trace.gear.length)
    const indices = indicesInRange(trace.distance, count, range)
    const span = range.max - range.min
    const ySpan = yRange.max - yRange.min
    const points: { x: number; y: number }[] = []
    let previousY: number | undefined
    for (const index of indices) {
        const distance = trace.distance[index]
        const value = trace.gear[index]
        if (!Number.isFinite(distance) || !Number.isFinite(value)) continue
        const x = PAD.left + ((distance - range.min) / span) * innerW
        const ratio = clamp((value - yRange.min) / ySpan, 0, 1)
        const y = PAD.top + innerH * (1 - ratio)
        if (previousY !== undefined && previousY !== y) {
            points.push({ x, y: previousY })
        }
        points.push({ x, y })
        previousY = y
    }
    return points
}

const deltaPoints = (
    lap: Trace,
    baseline: Trace | undefined,
    range: { min: number; max: number },
    yRange: { min: number; max: number },
    innerW: number,
    innerH: number
): { x: number; y: number }[] => {
    if (!baseline || lap.lapId === baseline.lapId) return []
    const count = lap.distance.length
    const indices = indicesInRange(lap.distance, count, range)
    const span = range.max - range.min
    const ySpan = yRange.max - yRange.min
    const points: { x: number; y: number }[] = []
    for (const index of indices) {
        const distance = lap.distance[index]
        if (!Number.isFinite(distance)) continue
        const delta = deltaToBaseline(lap, baseline, distance)
        if (delta === undefined) continue
        const x = PAD.left + ((distance - range.min) / span) * innerW
        const ratio = clamp((delta - yRange.min) / ySpan, 0, 1)
        const y = PAD.top + innerH * (1 - ratio)
        points.push({ x, y })
    }
    return points
}

const strokeSeries = (
    graphics: Graphics,
    points: readonly { x: number; y: number }[],
    color: number,
    alpha: number,
    width: number
) => {
    if (points.length < 2) return
    graphics.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y)
    }
    graphics.stroke({
        width,
        color,
        alpha,
        cap: "round",
        join: "round",
    })
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))

const drawZoneBands = (
    graphics: Graphics,
    zones: readonly DivergenceZone[] | undefined,
    active: DivergenceZone | undefined,
    range: { min: number; max: number },
    innerW: number,
    innerH: number,
    palette: readonly number[]
) => {
    if (!zones || zones.length === 0) return
    const span = range.max - range.min
    if (span <= 0) return
    for (const zone of zones) {
        const start = clamp(zone.startM, range.min, range.max)
        const end = clamp(zone.endM, range.min, range.max)
        if (end - start <= 0) continue
        const x = PAD.left + ((start - range.min) / span) * innerW
        const width = ((end - start) / span) * innerW
        const hot =
            active !== undefined &&
            active.startM === zone.startM &&
            active.endM === zone.endM
        const color =
            palette[zone.colorIndex] ?? lapColorFallback(zone.colorIndex)
        graphics.rect(x, PAD.top, Math.max(width, 1), innerH)
        graphics.fill({ color, alpha: hot ? 0.38 : 0.18 })
    }
}

const indicesInRange = (
    distances: ArrayLike<number>,
    count: number,
    range: { min: number; max: number }
): number[] => {
    let firstIn = -1
    let lastIn = -1
    for (let index = 0; index < count; index += 1) {
        const distance = distances[index]
        if (!Number.isFinite(distance)) continue
        if (distance < range.min || distance > range.max) continue
        if (firstIn < 0) firstIn = index
        lastIn = index
    }
    if (firstIn < 0 || lastIn < firstIn) return []
    const first = Math.max(0, firstIn - 1)
    const last = Math.min(count - 1, lastIn + 1)
    return downsampleIndices(last - first + 1, MAX_POINTS).map(
        offset => first + offset
    )
}
