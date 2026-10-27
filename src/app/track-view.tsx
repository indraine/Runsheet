import { Application, Graphics, Text } from "pixi.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import { fitFrame, type GroundPoint, type GroundSeries } from "~/app/fit-ground"
import { followPlotBox, plotResolution } from "~/app/plot-frame"
import { uiScale } from "~/app/scale"
import { themeGeneration } from "~/app/theme"
import { boundariesFor } from "~/app/track-catalog"
import {
    sectorLayout,
    type SectorId,
    type SectorLayout,
} from "~/app/track-geometry"
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
const EDGE_WIDTH = 1.5
const CUT_WIDTH = 2
const ROAD_WIDTH = 3
const CAR_RADIUS = 5
const CAR_RING = 2
const LABEL_SIZE = 11

const FALLBACK_ACCENT = 0x2a6fc9
const FALLBACK_EDGE = 0x475569
const FALLBACK_SURFACE = 0xffffff
const FALLBACK_INK = 0x0f172a
const FALLBACK_S1 = 0x059669
const FALLBACK_S2 = 0xd97706
const FALLBACK_S3 = 0x2a6fc9

const BAND_ALPHA = 0.42
const BAND_DIM_ALPHA = 0.18

type Viewport = { clientWidth: number; clientHeight: number }

type TrackLayout = {
    bands: { id: SectorId; polygon: GroundPoint[] }[]
    outer: GroundPoint[]
    inner: GroundPoint[]
    road: GroundPoint[]
    car: GroundPoint | undefined
    sectors: {
        cuts: { left: GroundPoint; right: GroundPoint }[]
        labels: { id: SectorId; name: string; at: GroundPoint }[]
    }
    closed: boolean
}

export const TrackView = (props: {
    track?: string
    road?: Trace
    car?: Trace
    s1EndM?: number | null
    s2EndM?: number | null
    sector?: SectorId
    class?: string
}) => {
    let host: HTMLDivElement | undefined
    let fitScale = () => {}
    let asphaltGraphics: Graphics | undefined
    let edgeGraphics: Graphics | undefined
    let sectorGraphics: Graphics | undefined
    let roadGraphics: Graphics | undefined
    let carGraphics: Graphics | undefined
    let labels: Text[] = []
    let placement: Placement | undefined
    let disposed = false
    let ready = false

    const redraw = () => {
        const view = host
        const asphalt = asphaltGraphics
        const edges = edgeGraphics
        const sectors = sectorGraphics
        const road = roadGraphics
        const car = carGraphics
        if (
            !ready ||
            !view ||
            !asphalt ||
            !edges ||
            !sectors ||
            !road ||
            !car
        ) {
            return
        }

        asphalt.clear()
        edges.clear()
        sectors.clear()
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
            ? layoutCatalog(
                  bounds,
                  placement,
                  props.car,
                  props.s1EndM,
                  props.s2EndM,
                  view
              )
            : layoutTrace(props.road, props.car, view)

        const colors = themeColors()
        for (const band of laid.bands) {
            const active =
                props.sector === undefined || props.sector === band.id
            fillPolygon(
                asphalt,
                band.polygon,
                colors.sector[band.id],
                active ? BAND_ALPHA : BAND_DIM_ALPHA
            )
        }
        strokeRoad(edges, laid.outer, EDGE_WIDTH, colors.edge, true)
        strokeRoad(edges, laid.inner, EDGE_WIDTH, colors.edge, true)

        for (const cut of laid.sectors.cuts) {
            sectors.moveTo(cut.left.x, cut.left.y)
            sectors.lineTo(cut.right.x, cut.right.y)
            sectors.stroke({
                width: CUT_WIDTH,
                color: colors.cut,
                cap: "butt",
            })
        }

        syncLabels(laid.sectors.labels, colors, props.sector)

        if (!bounds && laid.road.length >= 2) {
            strokeRoad(road, laid.road, ROAD_WIDTH, colors.road, laid.closed)
        }
        if (laid.car) {
            drawCar(car, laid.car, {
                fill: colors.accent,
                ring: colors.surface,
            })
        }
    }

    const syncLabels = (
        marks: TrackLayout["sectors"]["labels"],
        colors: ThemeColors,
        active: SectorId | undefined
    ) => {
        for (let index = 0; index < labels.length; index += 1) {
            const label = labels[index]
            const mark = marks[index]
            if (!mark) {
                label.visible = false
                continue
            }
            label.visible = true
            label.text = mark.name
            label.x = mark.at.x
            label.y = mark.at.y
            label.style.fill = colors.sector[mark.id]
            label.alpha = active === undefined || active === mark.id ? 1 : 0.45
        }
    }

    onMount(() => {
        const view = host
        if (!view) return

        const app = new Application()
        const fit = followPlotBox(app, view, redraw, () => ready)
        fitScale = fit

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
                asphaltGraphics = new Graphics()
                edgeGraphics = new Graphics()
                sectorGraphics = new Graphics()
                roadGraphics = new Graphics()
                carGraphics = new Graphics()
                labels = [1, 2, 3].map(
                    () =>
                        new Text({
                            text: "",
                            style: {
                                fontFamily:
                                    "JetBrains Mono, ui-monospace, monospace",
                                fontSize: LABEL_SIZE,
                                fontWeight: "600",
                                fill: FALLBACK_INK,
                                align: "center",
                            },
                            anchor: { x: 0.5, y: 0.5 },
                        })
                )
                app.stage.addChild(
                    asphaltGraphics,
                    edgeGraphics,
                    sectorGraphics,
                    roadGraphics,
                    carGraphics,
                    ...labels
                )
                view.appendChild(app.canvas)
                ready = true
                fit()
            })
            .catch(() => {})

        onCleanup(() => {
            disposed = true
            if (!ready) return
            ready = false
            app.destroy(true, true)
            asphaltGraphics = undefined
            edgeGraphics = undefined
            sectorGraphics = undefined
            roadGraphics = undefined
            carGraphics = undefined
            labels = []
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
        props.s1EndM
        props.s2EndM
        props.sector
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
            class={cn("h-full w-full overflow-hidden", props.class)}
            role="img"
            aria-label={t("app.trackView")}
        />
    )
}

type ThemeColors = {
    edge: number
    cut: number
    road: number
    accent: number
    surface: number
    sector: Record<SectorId, number>
}

const themeColors = (): ThemeColors => ({
    edge: cssColor("--secondary", FALLBACK_EDGE),
    cut: cssColor("--ink", FALLBACK_INK),
    road: cssColor("--secondary", FALLBACK_EDGE),
    accent: cssColor("--accent", FALLBACK_ACCENT),
    surface: cssColor("--surface", FALLBACK_SURFACE),
    sector: {
        1: cssColor("--gain", FALLBACK_S1),
        2: cssColor("--caution", FALLBACK_S2),
        3: cssColor("--accent", FALLBACK_S3),
    },
})

const layoutCatalog = (
    bounds: TrackBoundaries,
    placement: Placement | undefined,
    car: Trace | undefined,
    s1EndM: number | null | undefined,
    s2EndM: number | null | undefined,
    view: Viewport
): TrackLayout => {
    const sectors = sectorLayout(bounds, s1EndM, s2EndM)
    const tip = car ? lastPoint(car) : undefined
    const fit = placement?.status === "matched" ? placement.fit : undefined
    const placed = tip && fit ? applySimilarity(tip, fit) : undefined

    const bandCount = sectors?.bands.length ?? 0
    const base: GroundSeries[] = [
        ...(sectors?.bands.map(band => asGround(band.polygon)) ?? []),
        asGround(bounds.left),
        asGround(bounds.right),
        ...sectorSeries(sectors),
    ]
    const carIndex = placed ? base.length : -1
    const series = placed ? [...base, asGround([placed])] : base
    const fitted = fitFrame(
        series,
        view.clientWidth,
        view.clientHeight,
        PADDING,
        [asGround(bounds.left), asGround(bounds.right)]
    )

    return {
        bands: (sectors?.bands ?? []).map((band, index) => ({
            id: band.id,
            polygon: fitted[index] ?? [],
        })),
        outer: fitted[bandCount] ?? [],
        inner: fitted[bandCount + 1] ?? [],
        road: [],
        car: carIndex >= 0 ? fitted[carIndex]?.[0] : undefined,
        sectors: mapSectors(sectors, fitted, bandCount),
        closed: true,
    }
}

const sectorSeries = (sectors: SectorLayout | undefined): GroundSeries[] => {
    if (!sectors) return []
    const series: GroundSeries[] = []
    for (const cut of sectors.cuts) {
        series.push(asGround([cut.left, cut.right]))
    }
    for (const label of sectors.labels) {
        series.push(asGround([label.at]))
    }
    return series
}

const mapSectors = (
    sectors: SectorLayout | undefined,
    fitted: GroundPoint[][],
    bandCount: number
): TrackLayout["sectors"] => {
    if (!sectors) return { cuts: [], labels: [] }
    const cutStart = bandCount + 2
    const cuts = sectors.cuts.map((_, index) => {
        const points = fitted[cutStart + index] ?? []
        return {
            left: points[0] ?? { x: 0, y: 0 },
            right: points[1] ?? { x: 0, y: 0 },
        }
    })
    const labelStart = cutStart + sectors.cuts.length
    const labels = sectors.labels.map((label, index) => ({
        id: label.id,
        name: label.name,
        at: fitted[labelStart + index]?.[0] ?? { x: 0, y: 0 },
    }))
    return { cuts, labels }
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
    return {
        bands: [],
        outer: [],
        inner: [],
        road: fitted[0] ?? [],
        car: fitted[1]?.[0],
        sectors: { cuts: [], labels: [] },
        closed: false,
    }
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

const fillPolygon = (
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
