import { A, useNavigate } from "@solidjs/router"
import { Check } from "lucide-solid"
import { createEffect, createSignal, For, Index, Show } from "solid-js"
import { hasAsphalt } from "~/app/track-catalog"
import { TrackLine } from "~/app/track-line"
import type { LiveCard as LiveCardModel, LiveLapRow } from "~/domain"
import { carName, fmt, t, trackCodes, trackName } from "~/i18n"
import { locale } from "~/i18n/locale"
import { cn } from "~/ui"

export const LiveCard = (props: { card: LiveCardModel }) => {
    const card = () => props.card
    const [preview, setPreview] = createSignal<string>()
    const shownTrack = () => preview() ?? card().session.track
    const ownTrack = () => shownTrack() === card().session.track
    const seedDev = () =>
        import.meta.env.DEV && card().session.id.startsWith("seed-")

    createEffect(() => {
        card().session.id
        setPreview(undefined)
    })

    return (
        <section class="mx-6 mt-6 shrink-0 overflow-hidden rounded border border-line bg-surface">
            <header class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-3">
                <div class="flex min-w-0 items-baseline gap-3">
                    <div class="relative min-w-0">
                        <h2
                            class="truncate font-mono text-lg font-semibold tracking-tight text-ink uppercase"
                            aria-hidden={seedDev()}
                        >
                            {trackName(shownTrack())}
                        </h2>
                        <Show when={seedDev()}>
                            <select
                                class="absolute inset-0 w-full cursor-pointer opacity-0"
                                aria-label={t("app.previewTrack")}
                                value={shownTrack()}
                                onChange={event =>
                                    setPreview(event.currentTarget.value)
                                }
                            >
                                <For each={trackCodes}>
                                    {code => (
                                        <option value={code}>
                                            {trackName(code)}
                                        </option>
                                    )}
                                </For>
                            </select>
                        </Show>
                    </div>
                    <Show when={ownTrack() && card().trackLengthM}>
                        {length => (
                            <span class="shrink-0 font-mono text-[11px] text-secondary">
                                {formatMetres(length())}
                            </span>
                        )}
                    </Show>
                </div>
                <p class="font-mono text-[13px] text-ink">
                    {carName(card().session.car)}
                </p>
                <p class="font-mono text-[11px] text-secondary">
                    <span class="tracking-wide uppercase">
                        {t("app.liveAir")}
                    </span>{" "}
                    {formatCelsius(card().session.airTemp)}
                    <span class="text-muted" aria-hidden="true">
                        {" "}
                        ·{" "}
                    </span>
                    <span class="tracking-wide uppercase">
                        {t("app.liveRoad")}
                    </span>{" "}
                    {formatCelsius(card().session.roadTemp)}
                </p>
            </header>

            <div class="grid border-b border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
                <Summary
                    label={t("app.liveBest")}
                    value={bestTime(card().bestLap?.timeMs)}
                    hint={lapLabel(card().bestLap)}
                />
                <Summary
                    label={t("app.liveCurrent")}
                    value={lapLabel(card().currentLap)}
                    hint={currentHint(card())}
                    hintClass={deltaClass(currentRow(card()))}
                />
                <Summary
                    label={t("app.livePressure")}
                    value={pressureText(card().pressurePsi)}
                    hint={t("app.psi")}
                />
            </div>

            <div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
                <LapTable
                    sessionId={card().session.id}
                    rows={card().rows}
                    best={card().bestLap}
                />
                <div class="relative min-h-72 overflow-hidden border-t border-line lg:border-t-0 lg:border-l">
                    <Show
                        when={
                            (ownTrack() && (card().road || card().car)) ||
                            hasAsphalt(shownTrack())
                        }
                        fallback={
                            <p class="flex h-full min-h-72 items-center justify-center font-mono text-[11px] text-muted">
                                {t("app.empty")}
                            </p>
                        }
                    >
                        <TrackLine
                            class="absolute inset-0 min-h-0"
                            track={shownTrack()}
                            road={ownTrack() ? card().road : undefined}
                            car={ownTrack() ? card().car : undefined}
                        />
                    </Show>
                </div>
            </div>
        </section>
    )
}

const Summary = (props: {
    label: string
    value: string
    hint: string
    hintClass?: string
}) => (
    <div class="px-4 py-3">
        <p class="font-mono text-[10px] font-semibold tracking-wide text-secondary uppercase">
            {props.label}
        </p>
        <p class="mt-1 font-mono text-[28px] leading-8 font-semibold tracking-tight text-ink">
            {props.value}
        </p>
        <p
            class={cn(
                "mt-1 font-mono text-[11px] text-secondary",
                props.hintClass
            )}
        >
            {props.hint}
        </p>
    </div>
)

const VISIBLE_LAP_ROWS = 7

const LAP_HEAD_REM = 2

const LAP_ROW_REM = 2.25

const lapTableMaxHeight = (): string =>
    `calc(${LAP_HEAD_REM}rem + ${VISIBLE_LAP_ROWS} * ${LAP_ROW_REM}rem + 1px)`

const LapTable = (props: {
    sessionId: string
    rows: LiveLapRow[]
    best: LiveCardModel["bestLap"]
}) => (
    <div class="overflow-auto" style={{ "max-height": lapTableMaxHeight() }}>
        <table class="w-full min-w-[40rem] border-collapse text-left">
            <caption class="sr-only">{t("app.lapTable")}</caption>
            <thead class="sticky top-0 z-10 bg-surface">
                <tr class="border-b border-line font-mono text-[10px] font-semibold tracking-wide text-secondary uppercase">
                    <th class="h-8 px-3 font-semibold">{t("app.colLap")}</th>
                    <th class="h-8 px-3 font-semibold">{t("app.colTime")}</th>
                    <th class="h-8 px-3 font-semibold">{t("app.colDelta")}</th>
                    <th class="h-8 px-3 font-semibold">S1</th>
                    <th class="h-8 px-3 font-semibold">S2</th>
                    <th class="h-8 px-3 font-semibold">S3</th>
                    <th class="h-8 px-3 font-semibold">{t("app.colFuel")}</th>
                    <th class="h-8 px-3 font-semibold">{t("app.colValid")}</th>
                </tr>
            </thead>
            <tbody>
                <Index each={props.rows}>
                    {row => (
                        <LapRow
                            sessionId={props.sessionId}
                            row={row()}
                            best={props.best}
                        />
                    )}
                </Index>
            </tbody>
        </table>
    </div>
)

const LapRow = (props: {
    sessionId: string
    row: LiveLapRow
    best: LiveCardModel["bestLap"]
}) => {
    const navigate = useNavigate()
    const href = () => `/sessions/${props.sessionId}/laps/${props.row.lap.id}`
    const muted = () => !props.row.lap.valid
    const open = (event: MouseEvent) => {
        const target = event.target
        if (target instanceof Element && target.closest("a")) return
        navigate(href())
    }

    return (
        <tr
            class={cn(
                "h-9 cursor-pointer border-b border-line last:border-b-0 hover:bg-inset",
                muted() ? "text-muted" : "text-ink"
            )}
            onClick={open}
        >
            <th scope="row" class="px-3 font-mono text-[13px] font-medium">
                <A
                    href={href()}
                    class="rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20"
                >
                    <span class="inline-flex items-center gap-1.5">
                        L{props.row.lap.number}
                        <Show when={props.row.lap.timeMs === null}>
                            <span
                                class="size-1.5 rounded-full bg-accent"
                                aria-hidden="true"
                            />
                        </Show>
                        <Show when={props.row.best}>
                            <span class="text-accent">{t("app.pb")}</span>
                        </Show>
                    </span>
                </A>
            </th>
            <td class={cn("px-3 font-mono text-[13px]", timeClass(props.row))}>
                {props.row.lap.timeMs === null
                    ? t("app.empty")
                    : fmt.lap(props.row.lap.timeMs)}
            </td>
            <td class={cn("px-3 font-mono text-[13px]", deltaClass(props.row))}>
                {deltaText(props.row)}
            </td>
            <SectorCell
                row={props.row}
                milliseconds={props.row.lap.s1Ms}
                bestMilliseconds={props.best?.s1Ms ?? null}
            />
            <SectorCell
                row={props.row}
                milliseconds={props.row.lap.s2Ms}
                bestMilliseconds={props.best?.s2Ms ?? null}
            />
            <SectorCell
                row={props.row}
                milliseconds={props.row.lap.s3Ms}
                bestMilliseconds={props.best?.s3Ms ?? null}
            />
            <td class="px-3 font-mono text-[13px]">
                {props.row.lap.fuel.toFixed(1)} {t("app.litre")}
            </td>
            <td class="px-3">
                <ValidMark valid={props.row.lap.valid} />
            </td>
        </tr>
    )
}

const SectorCell = (props: {
    row: LiveLapRow
    milliseconds: number | null
    bestMilliseconds: number | null
}) => (
    <td
        class={cn(
            "px-3 font-mono text-[13px]",
            sectorClass(props.row, props.milliseconds, props.bestMilliseconds)
        )}
    >
        {props.milliseconds === null
            ? t("app.empty")
            : fmt.sector(props.milliseconds)}
    </td>
)

const ValidMark = (props: { valid: boolean }) => (
    <Show
        when={props.valid}
        fallback={
            <span
                class="font-mono text-[13px] text-muted"
                aria-label={t("app.doesNotCount")}
            >
                {t("app.empty")}
            </span>
        }
    >
        <Check
            class="size-3.5 text-gain"
            strokeWidth={1.75}
            aria-label={t("app.counts")}
        />
    </Show>
)

const currentRow = (card: LiveCardModel): LiveLapRow | undefined => {
    const current = card.currentLap
    if (!current) return undefined
    return card.rows.find(row => row.lap.id === current.id)
}

const currentHint = (card: LiveCardModel): string => {
    if (!card.currentLap || card.sector === undefined) return t("app.empty")
    const sector = `${t("app.liveSector")} ${card.sector}`
    const row = currentRow(card)
    if (!row || row.deltaMs === null || row.best) return sector
    return `${sector} · ${fmt.delta(row.deltaMs)}`
}

const bestTime = (timeMs: number | null | undefined): string =>
    timeMs === null || timeMs === undefined ? t("app.empty") : fmt.lap(timeMs)

const lapLabel = (lap: { number: number } | undefined): string =>
    lap ? `L${lap.number}` : t("app.empty")

const pressureText = (value: number | undefined): string =>
    value === undefined ? t("app.empty") : value.toFixed(1)

const deltaText = (row: LiveLapRow): string => {
    if (row.best) return t("app.bestMark")
    if (row.deltaMs === null) return t("app.empty")
    return fmt.delta(row.deltaMs)
}

const timeClass = (row: LiveLapRow): string => {
    if (!row.lap.valid || row.lap.timeMs === null) return "text-muted"
    if (row.best) return "text-accent"
    return "text-ink"
}

const deltaClass = (row: LiveLapRow | undefined): string => {
    if (!row || !row.lap.valid || row.deltaMs === null) return "text-muted"
    if (row.best) return "text-accent"
    if (row.deltaMs < 0) return "text-gain"
    if (row.deltaMs > 0) return "text-loss"
    return "text-ink"
}

const sectorClass = (
    row: LiveLapRow,
    milliseconds: number | null,
    bestMilliseconds: number | null
): string => {
    if (!row.lap.valid || milliseconds === null) return "text-muted"
    if (row.best) return "text-accent"
    if (bestMilliseconds !== null && milliseconds < bestMilliseconds) {
        return "text-accent"
    }
    return "text-ink"
}

const formatCelsius = (value: number): string => `${value.toFixed(1)}°C`

const formatMetres = (value: number): string =>
    `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Math.round(value))} ${t("app.metre")}`
