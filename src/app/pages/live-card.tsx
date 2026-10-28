import { Select, createListCollection } from "@ark-ui/solid/select"
import { Check } from "lucide-solid"
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Index,
    Show,
    untrack,
} from "solid-js"
import { Portal } from "solid-js/web"
import {
    screenMenuListClass,
    screenPopupClass,
    screenPositioning,
} from "~/app/screen-position"
import { liveClock } from "~/app/status"
import { hasAsphalt } from "~/app/track-catalog"
import { TrackView } from "~/app/track-view"
import {
    readSectorMs,
    type LiveCard as LiveCardModel,
    type LiveLapRow,
    type SectorClock,
} from "~/domain"
import type { LiveClock } from "~/ipc/status"
import { carName, fmt, t, trackCodes, trackName } from "~/i18n"
import { locale } from "~/i18n/locale"
import { cn } from "~/ui"

export const LiveCard = (props: { card: LiveCardModel | undefined }) => {
    const [held, setHeld] = createSignal(untrack(() => props.card))
    createEffect(() => {
        const next = props.card
        if (next) setHeld(next)
    })
    const card = () => held()!
    const [preview, setPreview] = createSignal<string>()
    const shownTrack = () => preview() ?? card().session.track
    const tracks = createMemo(() =>
        createListCollection({
            items: [...trackCodes],
            itemToValue: code => code,
            itemToString: code => trackName(code),
        })
    )
    const ownTrack = () => shownTrack() === card().session.track
    const clockFor = (): LiveClock | undefined => {
        const tick = liveClock()
        const current = card()
        if (!tick || current.session.status !== "live") return undefined
        if (tick.sessionId !== current.session.id) return undefined
        return tick
    }
    const seedDev = () =>
        import.meta.env.DEV && card().session.id.startsWith("seed-")

    createEffect(() => {
        card().session.id
        setPreview(undefined)
    })

    return (
        <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-line bg-surface">
            <header class="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-3">
                <div class="flex min-w-0 items-baseline gap-3">
                    <div class="relative min-w-0">
                        <h2
                            class="truncate font-mono text-lg font-semibold tracking-tight text-ink uppercase select-text"
                            aria-hidden={seedDev()}
                        >
                            {trackName(shownTrack())}
                        </h2>
                        <Show when={seedDev()}>
                            <Select.Root
                                collection={tracks()}
                                value={[shownTrack()]}
                                positioning={screenPositioning({
                                    placement: "bottom-start",
                                    gutter: 4,
                                })}
                                onValueChange={details => {
                                    const next = details.value[0]
                                    if (next) setPreview(next)
                                }}
                            >
                                <Select.Control class="absolute inset-0">
                                    <Select.Trigger
                                        class="size-full cursor-pointer opacity-0"
                                        aria-label={t("app.previewTrack")}
                                    >
                                        {trackName(shownTrack())}
                                    </Select.Trigger>
                                </Select.Control>
                                <Portal>
                                    <Select.Positioner class={screenPopupClass}>
                                        <Select.Content
                                            class={cn(
                                                screenMenuListClass,
                                                "w-56 rounded border border-line bg-surface p-1 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)] outline-none"
                                            )}
                                        >
                                            <For each={trackCodes}>
                                                {code => (
                                                    <Select.Item
                                                        item={code}
                                                        class="flex cursor-pointer rounded px-2 py-1.5 text-left font-mono text-[13px] text-ink outline-none data-highlighted:bg-inset"
                                                    >
                                                        <Select.ItemText class="select-text">
                                                            {trackName(code)}
                                                        </Select.ItemText>
                                                    </Select.Item>
                                                )}
                                            </For>
                                        </Select.Content>
                                    </Select.Positioner>
                                </Portal>
                            </Select.Root>
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
                    <Show when={card().session.driver}>
                        {card().session.driver}
                        <span class="text-muted" aria-hidden="true">
                            {" "}
                            ·{" "}
                        </span>
                    </Show>
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

            <div class="grid shrink-0 border-b border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
                <Summary
                    label={t("app.liveBest")}
                    value={bestTime(card().bestLap?.timeMs)}
                    hint={lapLabel(card().bestLap)}
                />
                <Summary
                    label={t("app.liveCurrent")}
                    value={currentValue(card(), clockFor())}
                    hint={currentHint(card(), clockFor())}
                    hintClass={deltaClass(currentRow(card()))}
                />
                <Summary
                    label={t("app.livePressure")}
                    value={pressureText(card().pressurePsi)}
                    hint={t("app.psi")}
                />
            </div>

            <div class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:grid-rows-[minmax(0,1fr)]">
                <LapTable
                    rows={card().rows}
                    best={card().bestLap}
                    clock={clockFor()}
                />
                <div class="relative min-h-0 overflow-hidden border-t border-line lg:border-t-0 lg:border-l">
                    <Show
                        when={
                            (ownTrack() && (card().road || card().car)) ||
                            hasAsphalt(shownTrack())
                        }
                        fallback={
                            <p class="flex h-full items-center justify-center font-mono text-[11px] text-muted">
                                {t("app.empty")}
                            </p>
                        }
                    >
                        <TrackView
                            class="absolute inset-0 min-h-0"
                            track={shownTrack()}
                            road={ownTrack() ? card().road : undefined}
                            car={ownTrack() ? card().car : undefined}
                            s1EndM={
                                ownTrack()
                                    ? (card().currentLap?.s1EndM ??
                                      card().bestLap?.s1EndM)
                                    : undefined
                            }
                            s2EndM={
                                ownTrack()
                                    ? (card().currentLap?.s2EndM ??
                                      card().bestLap?.s2EndM)
                                    : undefined
                            }
                            sector={
                                ownTrack()
                                    ? (clockFor()?.sector ?? card().sector)
                                    : undefined
                            }
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
    rows: LiveLapRow[]
    best: LiveCardModel["bestLap"]
    clock: LiveClock | undefined
}) => (
    <div
        class="h-full min-h-0 min-w-0 overflow-auto overscroll-contain [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]"
        style={{ "max-height": lapTableMaxHeight() }}
    >
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
                            row={row()}
                            best={props.best}
                            clock={props.clock}
                        />
                    )}
                </Index>
                <Show when={props.clock?.outlap}>
                    <OutlapRow />
                </Show>
            </tbody>
        </table>
    </div>
)

const LapRow = (props: {
    row: LiveLapRow
    best: LiveCardModel["bestLap"]
    clock: LiveClock | undefined
}) => {
    const muted = () => !props.row.lap.valid
    const timeMs = () => {
        if (props.row.lap.timeMs !== null) return props.row.lap.timeMs
        return props.clock?.lapMs ?? null
    }
    const running = () =>
        props.row.lap.timeMs === null && props.clock?.lapMs != null
    const timeLabel = () => {
        const ms = timeMs()
        return ms === null ? t("app.empty") : fmt.lap(ms)
    }

    return (
        <tr
            class={cn(
                "h-9 border-b border-line last:border-b-0",
                muted() ? "text-muted" : "text-ink"
            )}
        >
            <th scope="row" class="px-3 font-mono text-[13px] font-medium">
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
            </th>
            <td
                class={cn(
                    "px-3 font-mono text-[13px]",
                    running() ? "text-ink" : timeClass(props.row)
                )}
            >
                {timeLabel()}
            </td>
            <td class={cn("px-3 font-mono text-[13px]", deltaClass(props.row))}>
                {deltaText(props.row)}
            </td>
            <SectorCell
                row={props.row}
                column={1}
                milliseconds={props.row.lap.s1Ms}
                bestMilliseconds={props.best?.s1Ms ?? null}
                clock={props.clock}
            />
            <SectorCell
                row={props.row}
                column={2}
                milliseconds={props.row.lap.s2Ms}
                bestMilliseconds={props.best?.s2Ms ?? null}
                clock={props.clock}
            />
            <SectorCell
                row={props.row}
                column={3}
                milliseconds={props.row.lap.s3Ms}
                bestMilliseconds={props.best?.s3Ms ?? null}
                clock={props.clock}
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
    column: 1 | 2 | 3
    milliseconds: number | null
    bestMilliseconds: number | null
    clock: SectorClock | undefined
}) => {
    const read = () =>
        readSectorMs(
            props.column,
            props.milliseconds,
            props.row.lap.timeMs === null ? props.clock : undefined
        )
    const shown = () => read()?.ms
    const label = () => {
        const ms = shown()
        return ms == null ? t("app.empty") : fmt.sector(ms)
    }
    return (
        <td
            class={cn(
                "px-3 font-mono text-[13px]",
                read()?.settled
                    ? sectorClass(
                          props.row,
                          shown() ?? null,
                          props.bestMilliseconds
                      )
                    : shown() == null
                      ? "text-muted"
                      : "text-ink"
            )}
        >
            {label()}
        </td>
    )
}

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

const OutlapRow = () => (
    <tr class="h-9 text-muted">
        <th scope="row" class="px-3 font-mono text-[13px] font-medium">
            <span class="inline-flex items-center gap-1.5">
                {t("app.outlap")}
                <span
                    class="size-1.5 rounded-full bg-accent"
                    aria-hidden="true"
                />
            </span>
        </th>
        <td class="px-3 font-mono text-[13px]">{t("app.empty")}</td>
        <td class="px-3 font-mono text-[13px]">{t("app.empty")}</td>
        <td class="px-3 font-mono text-[13px]">{t("app.empty")}</td>
        <td class="px-3 font-mono text-[13px]">{t("app.empty")}</td>
        <td class="px-3 font-mono text-[13px]">{t("app.empty")}</td>
        <td class="px-3 font-mono text-[13px]">{t("app.empty")}</td>
        <td class="px-3">
            <ValidMark valid={false} />
        </td>
    </tr>
)

const currentValue = (
    card: LiveCardModel,
    clock: LiveClock | undefined
): string => {
    if (clock?.outlap) return t("app.outlap")
    if (clock?.lapMs != null) return fmt.lap(clock.lapMs)
    return lapLabel(card.currentLap)
}

const currentHint = (
    card: LiveCardModel,
    clock: LiveClock | undefined
): string => {
    if (clock?.outlap) return t("app.outlapHint")
    if (!clock) {
        if (!card.currentLap || card.sector === undefined) return t("app.empty")
        return hintWithDelta(card, `${t("app.liveSector")} ${card.sector}`)
    }
    const parts: string[] = []
    if (card.currentLap) parts.push(`L${card.currentLap.number}`)
    if (clock.sector) parts.push(`${t("app.liveSector")} ${clock.sector}`)
    if (parts.length === 0) return t("app.empty")
    return hintWithDelta(card, parts.join(" · "))
}

const hintWithDelta = (card: LiveCardModel, head: string): string => {
    const row = currentRow(card)
    if (!row || row.deltaMs === null || row.best) return head
    return `${head} · ${fmt.delta(row.deltaMs)}`
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
