import { Application, Graphics } from "pixi.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import { cssColor } from "~/app/telemetry/css-color"
import type { DistanceWindow, DivergenceZone } from "~/app/telemetry/divergence"
import { distanceSpan, downsampleIndices } from "~/app/telemetry/sample"
import { themeGeneration } from "~/app/theme"
import type { Trace } from "~/domain"
import { cn } from "~/ui"

const PAD = { top: 10, right: 10, bottom: 8, left: 10 }
const MAX_POINTS = 720
const FALLBACK_LAP_A = 0xea580c
const FALLBACK_LAP_B = 0x2563eb
const FALLBACK_INK = 0x0f172a
const FALLBACK_LINE = 0xe2e8f0
const FALLBACK_LOSS = 0xdc2626

export type ChannelKind = "throttle" | "brake" | "steer" | "speed"

export const ChannelView = (props: {
    kind: ChannelKind
    primary?: Trace
    reference?: Trace
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
    let plot: Graphics | undefined
    let cursor: Graphics | undefined
    let disposed = false
    let ready = false

    const span = () => {
        const focused = props.distanceWindow
        if (focused && focused.max > focused.min) return focused
        const primary = distanceSpan(props.primary)
        const reference = distanceSpan(props.reference)
        if (!primary && !reference) return undefined
        return {
            min: Math.min(primary?.min ?? Infinity, reference?.min ?? Infinity),
            max: Math.max(
                primary?.max ?? -Infinity,
                reference?.max ?? -Infinity
            ),
        }
    }

    const redraw = () => {
        const view = host
        const layer = plot
        const playhead = cursor
        if (!ready || !view || !layer || !playhead) return

        layer.clear()
        playhead.clear()

        const width = view.clientWidth
        const height = view.clientHeight
        const innerW = width - PAD.left - PAD.right
        const innerH = height - PAD.top - PAD.bottom
        if (innerW < 8 || innerH < 8) return

        const range = span()
        if (!range || range.max <= range.min) return

        const colors = {
            lapA: cssColor("--lap-a", FALLBACK_LAP_A),
            lapB: cssColor("--lap-b", FALLBACK_LAP_B),
            ink: cssColor("--ink", FALLBACK_INK),
            line: cssColor("--line", FALLBACK_LINE),
            loss: cssColor("--loss", FALLBACK_LOSS),
        }

        drawZoneBands(
            layer,
            props.zones,
            props.activeZone,
            range,
            innerW,
            innerH,
            colors.loss
        )
        drawChannel(
            layer,
            props.kind,
            props.primary,
            props.reference,
            range,
            innerW,
            innerH,
            colors
        )

        const cursorX =
            PAD.left +
            ((clamp(props.cursorM, range.min, range.max) - range.min) /
                (range.max - range.min)) *
                innerW
        playhead.moveTo(cursorX, PAD.top)
        playhead.lineTo(cursorX, PAD.top + innerH)
        playhead.stroke({ width: 1.5, color: colors.ink, alpha: 0.85 })
    }

    const distanceFromEvent = (clientX: number): number | undefined => {
        const view = host
        const range = span()
        if (!view || !range || range.max <= range.min) return undefined
        const box = view.getBoundingClientRect()
        const innerW = box.width - PAD.left - PAD.right
        if (innerW < 8) return undefined
        const ratio = clamp((clientX - box.left - PAD.left) / innerW, 0, 1)
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
        const observer = new ResizeObserver(() => redraw())
        observer.observe(view)

        const onPointerMove = (event: PointerEvent) => {
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
                plot = new Graphics()
                cursor = new Graphics()
                app.stage.addChild(plot, cursor)
                view.appendChild(app.canvas)
                ready = true
                redraw()
            })
            .catch(() => {})

        onCleanup(() => {
            disposed = true
            observer.disconnect()
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
        props.primary?.lapId
        props.primary?.distance
        props.primary?.throttle
        props.primary?.brake
        props.primary?.steer
        props.primary?.speed
        props.reference?.lapId
        props.reference?.distance
        props.reference?.throttle
        props.reference?.brake
        props.reference?.steer
        props.reference?.speed
        props.cursorM
        props.distanceWindow?.min
        props.distanceWindow?.max
        props.zones
        props.activeZone?.startM
        props.activeZone?.endM
        themeGeneration()
        redraw()
    })

    return (
        <div
            ref={element => {
                host = element
            }}
            class={cn(
                "h-full min-h-0 w-full touch-none cursor-crosshair",
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
    primary: Trace | undefined,
    reference: Trace | undefined,
    range: { min: number; max: number },
    innerW: number,
    innerH: number,
    colors: {
        lapA: number
        lapB: number
        line: number
    }
) => {
    const yRange = valueRange(kind, primary, reference, range)

    for (const fraction of [0, 0.5, 1]) {
        const y = PAD.top + innerH * (1 - fraction)
        graphics.moveTo(PAD.left, y)
        graphics.lineTo(PAD.left + innerW, y)
        graphics.stroke({ width: 1, color: colors.line, alpha: 0.7 })
    }

    if (reference) {
        strokeSeries(
            graphics,
            seriesPoints(reference, kind, range, yRange, innerW, innerH),
            colors.lapB,
            0.85,
            1.5
        )
    }
    if (primary) {
        strokeSeries(
            graphics,
            seriesPoints(primary, kind, range, yRange, innerW, innerH),
            colors.lapA,
            1,
            2
        )
    }
}

const valueRange = (
    kind: ChannelKind,
    primary: Trace | undefined,
    reference: Trace | undefined,
    range: { min: number; max: number }
): { min: number; max: number } => {
    if (kind === "throttle" || kind === "brake") return { min: 0, max: 1 }
    if (kind === "steer") return signedRange(primary, reference, range)
    return paddedRange(primary, reference, range)
}

const signedRange = (
    primary: Trace | undefined,
    reference: Trace | undefined,
    range: { min: number; max: number }
): { min: number; max: number } => {
    let extent = 0
    visitChannel(primary, "steer", range, value => {
        const magnitude = Math.abs(value)
        if (magnitude > extent) extent = magnitude
    })
    visitChannel(reference, "steer", range, value => {
        const magnitude = Math.abs(value)
        if (magnitude > extent) extent = magnitude
    })
    if (extent < 1) extent = 1
    const pad = extent * 0.08
    return { min: -(extent + pad), max: extent + pad }
}

const paddedRange = (
    primary: Trace | undefined,
    reference: Trace | undefined,
    range: { min: number; max: number }
): { min: number; max: number } => {
    let min = Infinity
    let max = -Infinity
    const visit = (value: number) => {
        if (value < min) min = value
        if (value > max) max = value
    }
    visitChannel(primary, "speed", range, visit)
    visitChannel(reference, "speed", range, visit)
    if (!Number.isFinite(min) || max <= min) return { min: 0, max: 1 }
    const pad = (max - min) * 0.08
    return { min: min - pad, max: max + pad }
}

const visitChannel = (
    trace: Trace | undefined,
    channel: "steer" | "speed",
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

const seriesPoints = (
    trace: Trace,
    kind: ChannelKind,
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
    color: number
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
        graphics.rect(x, PAD.top, Math.max(width, 1), innerH)
        graphics.fill({ color, alpha: hot ? 0.38 : 0.22 })
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
