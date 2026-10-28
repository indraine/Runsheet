import { Popover } from "@ark-ui/solid/popover"
import { Select, createListCollection } from "@ark-ui/solid/select"
import { useNavigate, useSearchParams } from "@solidjs/router"
import {
    batch,
    createEffect,
    createMemo,
    createResource,
    createSignal,
    For,
    type JSX,
    onCleanup,
    onMount,
    Show,
} from "solid-js"
import { Portal } from "solid-js/web"
import {
    ArrowLeftRight,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    X,
} from "lucide-solid"
import { DayNav } from "~/app/pages/day-nav"
import {
    screenMenuListClass,
    screenPopupClass,
    screenPopupOverModalClass,
    screenPositioning,
} from "~/app/screen-position"
import { setAnalysisHeading } from "~/app/status"
import { ChannelDrawer, CHANNEL_LABEL } from "~/app/telemetry/channel-drawer"
import {
    readChannelLayout,
    toggleChannel,
    visibleChannels,
    writeChannelLayout,
    type AnalysisChannel,
    type ChannelLayout,
} from "~/app/telemetry/channel-layout"
import {
    ChannelView,
    type ChannelKind,
    type ChannelTrace,
} from "~/app/telemetry/channel-view"
import {
    driversOnTrack,
    filterChoices,
} from "~/app/telemetry/compare-filters"
import {
    clearStoredComparison,
    MAX_COMPARE_LAPS,
    normalizeLapIds,
    primaryLapForSession,
    readStoredComparison,
    restoreComparison,
    writeStoredComparison,
} from "~/app/telemetry/compare-selection"
import {
    compareDivergenceZones,
    zoneWindow,
    type DivergenceCause,
    type DivergenceZone,
} from "~/app/telemetry/divergence"
import { fuelPerLap, meanFuelPerLap, stintLapsLeft } from "~/app/telemetry/fuel"
import { InstantHud } from "~/app/telemetry/instant-hud"
import {
    makeBaselineId,
    replaceLapId,
    toggleLapId,
} from "~/app/telemetry/lap-order"
import { lapTone } from "~/app/telemetry/lap-tone"
import {
    distanceSpan,
    sampleAtDistance,
    steerPeak,
} from "~/app/telemetry/sample"
import { SetupCard, type SetupRow } from "~/app/telemetry/setup-card"
import { previousLap } from "~/app/telemetry/setup-format"
import {
    TrajectoryView,
    type TrajectoryLine,
} from "~/app/telemetry/trajectory-view"
import {
    clearStoredZone,
    matchStoredZone,
    readStoredZone,
    withProgrammaticCursor,
    writeStoredZone,
} from "~/app/telemetry/view-memory"
import { SessionRepository, useSessionRepository } from "~/db"
import {
    groupByDay,
    localDayStart,
    type Lap,
    type Session,
    type SessionType,
} from "~/domain"
import { carName, fmt, t, trackName } from "~/i18n"
import { Button, cn } from "~/ui"

export type LapChoice = {
    lap: Lap
    session: Session
}

type Catalog = {
    choices: LapChoice[]
    /** Every lap of a session, ordered by number, for fuel deltas. */
    sessionLaps: ReadonlyMap<string, Lap[]>
}

const floatingMenuOpen = (): boolean =>
    document.querySelector(
        "[data-scope='select'][data-state='open'], [data-scope='popover'][data-state='open'], [data-scope='menu'][data-state='open'], [data-scope='date-picker'][data-state='open']"
    ) !== null

export const TelemetryPage = () => {
    const repository = useSessionRepository()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const remembered = readStoredComparison()
    const requestedSession = () => searchText(searchParams.session)
    const requestedLap = () => searchText(searchParams.lap)
    const requestedTrack = () => searchText(searchParams.track)
    const [cursorM, setCursorM] = createSignal(0)
    const [focus, setFocus] = createSignal<DivergenceZone>()
    const [pickerOpen, setPickerOpen] = createSignal(
        remembered === undefined && requestedSession() === undefined
    )
    const [confirmed, setConfirmed] = createSignal(false)
    const [lapIds, setLapIds] = createSignal<string[]>(remembered?.lapIds ?? [])
    const [layout, setLayout] = createSignal(readChannelLayout())

    const [catalog] = createResource(
        () => {
            const repo = repository()
            if (!repo) return undefined
            repo.revision()
            return repo
        },
        repo => loadCatalog(repo)
    )

    const choices = createMemo(() => catalog()?.choices ?? [])

    let appliedRemembered = false
    createEffect(() => {
        if (!repository() || catalog.state !== "ready" || appliedRemembered) {
            return
        }
        appliedRemembered = true
        const sessionId = requestedSession()
        if (sessionId) {
            const primary = primaryLapForSession(
                choices().map(item => item.lap),
                sessionId,
                requestedLap()
            )
            batch(() => {
                setConfirmed(false)
                setLapIds(primary ? [primary.id] : [])
                setPickerOpen(true)
            })
            return
        }
        const restored = restoreComparison(
            choices().map(item => ({
                id: item.lap.id,
                track: item.session.track,
            })),
            remembered
        )
        if (!restored) {
            batch(() => {
                setConfirmed(false)
                setLapIds([])
                setPickerOpen(true)
            })
            if (remembered) clearStoredComparison()
            return
        }
        batch(() => {
            setLapIds(restored.lapIds)
            setConfirmed(true)
            setPickerOpen(false)
        })
    })

    const baselineChoice = createMemo(() =>
        confirmed()
            ? choices().find(item => item.lap.id === lapIds()[0])
            : undefined
    )
    const trackChoices = createMemo(() => {
        const baseline = baselineChoice()
        if (!baseline) return []
        return choices().filter(
            item => item.session.track === baseline.session.track
        )
    })
    /** Selected laps in slot order; slot index is the compare color. */
    const selectedChoices = createMemo((): LapChoice[] => {
        const pool = trackChoices()
        return lapIds().flatMap(id => {
            const choice = pool.find(item => item.lap.id === id)
            return choice ? [choice] : []
        })
    })
    const activeIds = createMemo(() =>
        selectedChoices().map(item => item.lap.id)
    )

    createEffect(() => {
        if (!confirmed()) return
        const ids = activeIds()
        if (ids.length === 0) return
        writeStoredComparison({ lapIds: ids })
    })

    const [traces] = createResource(
        () => {
            const repo = repository()
            const ids = activeIds()
            if (!repo || ids.length === 0) return undefined
            return { repo, ids }
        },
        source => source.repo.readTraces(source.ids)
    )

    const traceOf = (choice: LapChoice | undefined) =>
        choice ? traces()?.get(choice.lap.id) : undefined
    const baselineTrace = createMemo(() => traceOf(selectedChoices()[0]))
    const otherTraces = createMemo(() =>
        selectedChoices().slice(1).map(traceOf)
    )
    const chartTraces = createMemo((): ChannelTrace[] => {
        const baseline = baselineTrace()
        if (!baseline) return []
        const list: ChannelTrace[] = [{ trace: baseline, colorIndex: 0 }]
        otherTraces().forEach((trace, index) => {
            if (trace) list.push({ trace, colorIndex: index + 1 })
        })
        return list
    })
    const chartLines = createMemo((): TrajectoryLine[] => {
        const selected = selectedChoices()
        return selected.flatMap((choice, colorIndex) => {
            const trace = traceOf(choice)
            if (!trace) return []
            return [
                {
                    id: choice.lap.id,
                    label: choiceLabel(choice.lap, choice.session, selected),
                    trace,
                    colorIndex,
                },
            ]
        })
    })

    createEffect(() => {
        const choice = baselineChoice()
        if (!choice) {
            setAnalysisHeading({ track: null, car: null })
            return
        }
        setAnalysisHeading({
            track: trackName(choice.session.track),
            car: carName(choice.session.car),
        })
    })

    onCleanup(() => setAnalysisHeading({ track: null, car: null }))

    createEffect(() => {
        const span = distanceSpan(baselineTrace())
        if (!span) return
        const current = cursorM()
        if (current < span.min || current > span.max) {
            withProgrammaticCursor(() => {
                setCursorM(span.min + (span.max - span.min) * 0.3)
            })
        }
    })

    const lapSamples = createMemo(() =>
        selectedChoices().map(choice =>
            sampleAtDistance(traceOf(choice), cursorM())
        )
    )
    const overlayTrace = createMemo(() => otherTraces()[0])
    const baselineSteerPeak = createMemo(() => steerPeak(baselineTrace()))
    const overlaySteerPeak = createMemo(() => steerPeak(overlayTrace()))
    const zones = createMemo(() =>
        compareDivergenceZones(baselineTrace(), otherTraces())
    )
    const chartWindow = createMemo(() => {
        const zone = focus()
        if (!zone) return undefined
        const span =
            distanceSpan(baselineTrace()) ??
            distanceSpan(otherTraces().find(Boolean))
        if (!span) return undefined
        return zoneWindow(zone, span)
    })

    const sessionLapsOf = (choice: LapChoice): Lap[] =>
        catalog()?.sessionLaps.get(choice.session.id) ?? []
    const fuelUsedOn = (choice: LapChoice): number | undefined =>
        fuelPerLap(choice.lap, previousLap(sessionLapsOf(choice), choice.lap))
    const setupRows = createMemo((): SetupRow[] => {
        const selected = selectedChoices()
        const samples = lapSamples()
        return selected.map((choice, colorIndex) => ({
            colorIndex,
            label: choiceLabel(choice.lap, choice.session, selected),
            lap: choice.lap,
            sample: samples[colorIndex],
            fuelPerLap: fuelUsedOn(choice),
        }))
    })
    const stintLeft = createMemo(() => {
        const baseline = selectedChoices()[0]
        if (!baseline) return undefined
        const stint = sessionLapsOf(baseline).filter(
            lap => lap.number <= baseline.lap.number
        )
        return stintLapsLeft(baseline.lap.fuel, meanFuelPerLap(stint))
    })

    const replaceLap = (index: number, lapId: string) =>
        setLapIds(replaceLapId(activeIds(), index, lapId))

    const toggleChartChannel = (channel: AnalysisChannel) => {
        const next = toggleChannel(layout(), channel)
        if (next === layout()) return
        setLayout(next)
        writeChannelLayout(next)
    }

    const openZone = (zone: DivergenceZone) => {
        const current = focus()
        if (
            current &&
            current.startM === zone.startM &&
            current.endM === zone.endM
        ) {
            return
        }
        const cursor = cursorM()
        batch(() => {
            setFocus(zone)
            if (cursor < zone.startM || cursor > zone.endM) {
                setCursorM((zone.startM + zone.endM) / 2)
            }
        })
    }

    const rememberedZone = readStoredZone()
    let zoneRestored = false
    createEffect(() => {
        if (zoneRestored || !confirmed() || traces.state !== "ready") return
        if (!baselineTrace()) return
        zoneRestored = true
        const match = matchStoredZone(zones(), rememberedZone)
        if (!match) {
            if (rememberedZone) clearStoredZone()
            return
        }
        withProgrammaticCursor(() => {
            batch(() => {
                setFocus(match)
                const cursor = cursorM()
                if (cursor < match.startM || cursor > match.endM) {
                    setCursorM((match.startM + match.endM) / 2)
                }
            })
        })
    })

    createEffect(() => {
        const current = focus()
        if (!zoneRestored) return
        if (!current) {
            clearStoredZone()
            return
        }
        writeStoredZone({ startM: current.startM, endM: current.endM })
    })

    createEffect(() => {
        const current = focus()
        if (!current) return
        const alive = zones().some(
            zone => zone.startM === current.startM && zone.endM === current.endM
        )
        if (!alive) setFocus(undefined)
    })

    createEffect(() => {
        if (!focus() || pickerOpen()) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            setFocus(undefined)
        }
        window.addEventListener("keydown", onKey)
        onCleanup(() => window.removeEventListener("keydown", onKey))
    })

    const pickerSeedIds = (): string[] => {
        if (confirmed()) return activeIds()
        const sessionId = requestedSession()
        if (!sessionId) return []
        const lap = primaryLapForSession(
            choices().map(item => item.lap),
            sessionId,
            requestedLap()
        )
        return lap ? [lap.id] : []
    }

    let zoomMap = (_factor: number) => {}
    const registerMapZoom = (zoom: ((factor: number) => void) | undefined) => {
        zoomMap = zoom ?? (() => {})
    }

    const pickerTrack = (): string | undefined => {
        const code = requestedTrack()
        if (!code) return undefined
        if (!choices().some(item => item.session.track === code)) {
            return undefined
        }
        return code
    }

    return (
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
            <CompareBanner
                choices={confirmed() ? trackChoices() : []}
                selected={selectedChoices()}
                onReplace={replaceLap}
                onEdit={confirmed() ? () => setPickerOpen(true) : undefined}
                zones={zones()}
                focus={focus()}
                onZone={openZone}
                onZoneClose={() => setFocus(undefined)}
                layout={confirmed() ? layout() : undefined}
                onToggleChannel={toggleChartChannel}
            />
            <Show
                when={baselineChoice()}
                fallback={
                    <Show when={!pickerOpen() && !catalog.loading}>
                        <p class="font-mono text-base text-secondary">
                            {t("app.telemetryMissing")}
                        </p>
                    </Show>
                }
            >
                {baseline => (
                    <>
                        <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 overflow-hidden lg:grid-cols-12 lg:grid-rows-1">
                            <section class="flex min-h-0 flex-col gap-3 overflow-hidden rounded border border-line bg-surface p-4 lg:col-span-7">
                                <div class="flex min-h-0 flex-1 flex-col gap-2">
                                    <For each={visibleChannels(layout())}>
                                        {channel => (
                                            <ChartStrip
                                                label={t(
                                                    CHANNEL_LABEL[channel]
                                                )}
                                                kind={channel}
                                                traces={chartTraces()}
                                                cursorM={cursorM()}
                                                onCursor={setCursorM}
                                                distanceWindow={chartWindow()}
                                                zones={zones()}
                                                activeZone={focus()}
                                                onZone={openZone}
                                                onZoom={factor =>
                                                    zoomMap(factor)
                                                }
                                            />
                                        )}
                                    </For>
                                </div>
                                <Show
                                    when={!traces.loading && !baselineTrace()}
                                >
                                    <p class="font-mono text-sm text-muted">
                                        {t("app.telemetryNoTrace")}
                                    </p>
                                </Show>
                            </section>

                            <div class="flex min-h-0 flex-col gap-4 overflow-y-auto lg:col-span-5">
                                <div class="relative min-h-40 flex-1 overflow-hidden rounded border border-line bg-inset">
                                    <TrajectoryView
                                        class="absolute inset-0"
                                        track={baseline().session.track}
                                        lines={chartLines()}
                                        zones={zones()}
                                        cursorM={cursorM()}
                                        onCursor={setCursorM}
                                        registerZoom={registerMapZoom}
                                    />
                                </div>

                                <SetupCard
                                    rows={setupRows()}
                                    stintLapsLeft={stintLeft()}
                                />

                                <InstantHud
                                    primary={lapSamples()[0]}
                                    reference={lapSamples()[1]}
                                    primarySteerPeak={baselineSteerPeak()}
                                    referenceSteerPeak={overlaySteerPeak()}
                                />
                            </div>
                        </div>
                    </>
                )}
            </Show>
            <Show when={pickerOpen()}>
                <ComparePickerModal
                    choices={choices()}
                    mode={confirmed() ? "edit" : "required"}
                    seedIds={pickerSeedIds()}
                    initialTrack={pickerTrack()}
                    onDismiss={() => setPickerOpen(false)}
                    onLeave={() => navigate("/")}
                    onConfirm={ids => {
                        batch(() => {
                            setLapIds(normalizeLapIds(ids))
                            setConfirmed(true)
                            setPickerOpen(false)
                        })
                        setSearchParams(
                            {
                                session: undefined,
                                lap: undefined,
                                track: undefined,
                            },
                            { replace: true }
                        )
                    }}
                />
            </Show>
        </div>
    )
}

const CAUSE_LABEL = {
    brake: "app.telemetryCauseBrake",
    throttle: "app.telemetryCauseThrottle",
    steer: "app.telemetryCauseSteer",
    speed: "app.telemetryCauseSpeed",
} as const satisfies Record<DivergenceCause, string>

const sameZone = (left: DivergenceZone, right: DivergenceZone): boolean =>
    left.startM === right.startM && left.endM === right.endM

const DivergenceMenu = (props: {
    zones: readonly DivergenceZone[]
    focus?: DivergenceZone
    onOpen: (zone: DivergenceZone) => void
    onClose: () => void
}) => {
    const [open, setOpen] = createSignal(false)
    const selected = () => {
        const current = props.focus
        if (!current) return -1
        return props.zones.findIndex(zone => sameZone(zone, current))
    }
    const canPrev = () => selected() > 0
    const canNext = () => {
        const current = selected()
        const last = props.zones.length - 1
        if (last < 0) return false
        return current < 0 ? true : current < last
    }
    const step = (delta: -1 | 1) => {
        const count = props.zones.length
        if (count === 0) return
        const current = selected()
        const next =
            current < 0
                ? delta > 0
                    ? 0
                    : -1
                : current + delta
        if (next < 0 || next >= count) return
        const zone = props.zones[next]
        if (zone) props.onOpen(zone)
    }

    return (
        <div class="flex items-center gap-1">
            <IconButton
                class="size-9"
                label={t("app.telemetryPrevTurn")}
                disabled={!canPrev()}
                onClick={() => step(-1)}
            >
                <ChevronLeft class="size-4" strokeWidth={2} />
            </IconButton>
            <Popover.Root
                open={open()}
                onOpenChange={details => setOpen(details.open)}
                positioning={screenPositioning({ placement: "bottom-end" })}
            >
                <Popover.Trigger
                    class={cn(
                        "inline-flex h-9 cursor-pointer items-center gap-2 rounded border px-3 font-mono text-base outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20",
                        selected() >= 0
                            ? "border-loss bg-loss/15 text-loss"
                            : "border-line bg-inset text-secondary hover:border-loss/70 hover:text-loss"
                    )}
                    aria-label={t("app.telemetryDivergence")}
                >
                    <span
                        class="size-2 shrink-0 rounded-sm bg-loss"
                        aria-hidden="true"
                    />
                    <span>
                        {selected() >= 0
                            ? t("app.telemetryTurn", { n: selected() + 1 })
                            : t("app.telemetryDivergence")}
                    </span>
                    <ChevronDown class="size-4 shrink-0" strokeWidth={2} />
                </Popover.Trigger>
            <Portal>
                <Popover.Positioner class={screenPopupClass}>
                    <Popover.Content class="flex max-h-(--available-height) w-64 flex-col overflow-hidden rounded border border-line bg-surface shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none">
                        <div class="shrink-0 border-b border-line px-3 py-2">
                            <Popover.Title class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
                                {t("app.telemetryDivergence")}
                            </Popover.Title>
                        </div>
                        <ul class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                            <For each={props.zones}>
                                {(zone, index) => {
                                    const active = () => selected() === index()
                                    return (
                                        <li>
                                            <button
                                                type="button"
                                                class={cn(
                                                    "flex w-full cursor-pointer items-baseline justify-between gap-3 rounded px-2.5 py-2 text-left font-mono outline-none transition-colors",
                                                    active()
                                                        ? "bg-loss/15 text-loss"
                                                        : "text-ink hover:bg-inset"
                                                )}
                                                aria-current={
                                                    active()
                                                        ? "true"
                                                        : undefined
                                                }
                                                onClick={() => {
                                                    if (active())
                                                        props.onClose()
                                                    else props.onOpen(zone)
                                                    setOpen(false)
                                                }}
                                            >
                                                <span class="text-sm font-semibold">
                                                    {t("app.telemetryTurn", {
                                                        n: index() + 1,
                                                    })}
                                                </span>
                                                <span
                                                    class={cn(
                                                        "text-xs",
                                                        active()
                                                            ? undefined
                                                            : "text-secondary"
                                                    )}
                                                >
                                                    {t(CAUSE_LABEL[zone.cause])}
                                                </span>
                                            </button>
                                        </li>
                                    )
                                }}
                            </For>
                        </ul>
                        <Show when={props.focus}>
                            <div class="shrink-0 border-t border-line p-1.5">
                                <button
                                    type="button"
                                    class="flex w-full cursor-pointer rounded px-2.5 py-2 text-left font-mono text-sm text-secondary outline-none hover:bg-inset hover:text-ink"
                                    onClick={() => {
                                        props.onClose()
                                        setOpen(false)
                                    }}
                                >
                                    {t("app.telemetryFullLap")}
                                </button>
                            </div>
                        </Show>
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
            </Popover.Root>
            <IconButton
                class="size-9"
                label={t("app.telemetryNextTurn")}
                disabled={!canNext()}
                onClick={() => step(1)}
            >
                <ChevronRight class="size-4" strokeWidth={2} />
            </IconButton>
        </div>
    )
}

const ChartStrip = (props: {
    label: string
    kind: ChannelKind
    traces: readonly ChannelTrace[]
    cursorM: number
    onCursor: (distanceM: number) => void
    distanceWindow?: { min: number; max: number }
    zones?: readonly DivergenceZone[]
    activeZone?: DivergenceZone
    onZone?: (zone: DivergenceZone) => void
    onZoom?: (factor: number) => void
}) => (
    <div class="flex min-h-0 flex-1 flex-col gap-1">
        <p class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
            {props.label}
        </p>
        <div class="min-h-0 flex-1 overflow-hidden rounded border border-line bg-inset">
            <ChannelView
                kind={props.kind}
                traces={props.traces}
                cursorM={props.cursorM}
                onCursor={props.onCursor}
                distanceWindow={props.distanceWindow}
                zones={props.zones}
                activeZone={props.activeZone}
                onZone={props.onZone}
                onZoom={props.onZoom}
                label={props.label}
            />
        </div>
    </div>
)

const ALL_DRIVERS = "__all__"

type DriverOption = { id: string; label: string }

const TrackMenu = (props: {
    tracks: string[]
    value: string
    onChange: (track: string) => void
}) => {
    let trigger: HTMLButtonElement | undefined
    onMount(() => trigger?.focus())
    const collection = createMemo(() =>
        createListCollection({
            items: props.tracks,
            itemToValue: code => code,
            itemToString: code => trackName(code),
        })
    )

    return (
        <Select.Root
            collection={collection()}
            value={props.value ? [props.value] : []}
            positioning={screenPositioning({
                placement: "bottom-start",
                sameWidth: true,
            })}
            onValueChange={details => {
                const next = details.value[0]
                if (next) props.onChange(next)
            }}
        >
            <Select.Control>
                <Select.Trigger
                    ref={trigger}
                    class={cn(
                        "inline-flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded border border-line bg-inset px-3 text-left font-mono text-base outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20",
                        props.value ? "text-ink" : "text-muted"
                    )}
                >
                    <Select.ValueText
                        class="min-w-0 truncate select-text"
                        placeholder={t("app.telemetryPickTrackPlaceholder")}
                    />
                    <ChevronDown class="size-4 shrink-0" strokeWidth={2} />
                </Select.Trigger>
            </Select.Control>
            <Portal>
                <Select.Positioner class={screenPopupOverModalClass}>
                    <Select.Content
                        class={cn(
                            screenMenuListClass,
                            "rounded border border-line bg-surface p-1 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none"
                        )}
                    >
                        <For each={props.tracks}>
                            {code => (
                                <Select.Item
                                    item={code}
                                    class="flex cursor-pointer rounded px-2.5 py-2 text-left font-mono text-base text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink data-[state=checked]:text-ink"
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
    )
}

/** Single-select driver filter with an in-menu search field. */
const DriverMenu = (props: {
    drivers: string[]
    value: string | null
    onChange: (driver: string | null) => void
}) => {
    const [filter, setFilter] = createSignal("")
    const options = createMemo((): DriverOption[] => {
        const all: DriverOption = {
            id: ALL_DRIVERS,
            label: t("app.telemetryPickDriverAll"),
        }
        const named: DriverOption[] = props.drivers.map(name => ({
            id: name === "" ? "__unknown__" : name,
            label: driverLabel(name),
        }))
        const rows = [all, ...named]
        const q = filter().trim().toLowerCase()
        if (!q) return rows
        return rows.filter(
            item =>
                item.id === ALL_DRIVERS ||
                item.label.toLowerCase().includes(q) ||
                item.id.toLowerCase().includes(q)
        )
    })
    const selectedId = () => {
        if (props.value === null) return ALL_DRIVERS
        if (props.value === "") return "__unknown__"
        return props.value
    }
    const collection = createMemo(() =>
        createListCollection({
            items: options(),
            itemToValue: item => item.id,
            itemToString: item => item.label,
        })
    )
    const resolve = (id: string): string | null => {
        if (id === ALL_DRIVERS) return null
        if (id === "__unknown__") return ""
        return id
    }

    return (
        <Select.Root
            collection={collection()}
            value={[selectedId()]}
            positioning={screenPositioning({
                placement: "bottom-start",
                sameWidth: true,
            })}
            onValueChange={details => {
                const next = details.value[0]
                if (next) props.onChange(resolve(next))
            }}
            onOpenChange={details => {
                if (details.open) setFilter("")
            }}
        >
            <Select.Control>
                <Select.Trigger
                    class={cn(
                        "inline-flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded border border-line bg-inset px-3 text-left font-mono text-base outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20",
                        "text-ink"
                    )}
                >
                    <Select.ValueText class="min-w-0 truncate select-text" />
                    <ChevronDown class="size-4 shrink-0" strokeWidth={2} />
                </Select.Trigger>
            </Select.Control>
            <Portal>
                <Select.Positioner class={screenPopupOverModalClass}>
                    <Select.Content
                        class={cn(
                            "flex max-h-(--available-height) flex-col overflow-hidden rounded border border-line bg-surface shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none"
                        )}
                    >
                        <div class="shrink-0 border-b border-line p-1.5">
                            <input
                                type="search"
                                value={filter()}
                                placeholder={t("app.telemetryPickSearch")}
                                class="h-9 w-full rounded border border-line bg-inset px-2.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20"
                                onInput={event =>
                                    setFilter(event.currentTarget.value)
                                }
                                onKeyDown={event => event.stopPropagation()}
                            />
                        </div>
                        <div
                            class={cn(
                                screenMenuListClass,
                                "min-h-0 flex-1 p-1"
                            )}
                        >
                            <For each={options()}>
                                {item => (
                                    <Select.Item
                                        item={item}
                                        class="flex cursor-pointer rounded px-2.5 py-2 text-left font-mono text-base text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink data-[state=checked]:text-ink"
                                    >
                                        <Select.ItemText class="select-text">
                                            {item.label}
                                        </Select.ItemText>
                                    </Select.Item>
                                )}
                            </For>
                        </div>
                    </Select.Content>
                </Select.Positioner>
            </Portal>
        </Select.Root>
    )
}

const ComparePickerModal = (props: {
    choices: LapChoice[]
    mode: "required" | "edit"
    seedIds: string[]
    initialTrack?: string
    onDismiss: () => void
    onLeave: () => void
    onConfirm: (lapIds: string[]) => void
}) => {
    const tracks = createMemo(() => {
        const seen = new Set<string>()
        const list: string[] = []
        for (const choice of props.choices) {
            if (seen.has(choice.session.track)) continue
            seen.add(choice.session.track)
            list.push(choice.session.track)
        }
        return list
    })
    const choiceById = (lapId: string) =>
        props.choices.find(item => item.lap.id === lapId)
    const seedBaseline = choiceById(props.seedIds[0] ?? "")
    const [track, setTrack] = createSignal(
        seedBaseline?.session.track ?? props.initialTrack ?? ""
    )
    const [selected, setSelected] = createSignal<string[]>(
        seedBaseline
            ? props.seedIds.filter(
                  id =>
                      choiceById(id)?.session.track ===
                      seedBaseline.session.track
              )
            : []
    )
    const [day, setDay] = createSignal(
        seedBaseline ? localDayStart(seedBaseline.session.startedAt) : 0
    )
    /** `null` = every driver on the track. */
    const [driver, setDriver] = createSignal<string | null>(null)

    const driversAvailable = createMemo(() =>
        driversOnTrack(props.choices, track())
    )

    const driverFilter = (): string[] => {
        const current = driver()
        return current === null ? [] : [current]
    }

    const days = createMemo(() =>
        groupByDay(
            filterChoices(props.choices, {
                track: track(),
                drivers: driverFilter(),
                dayStart: null,
                query: "",
            }).map(choice => choice.session)
        )
    )

    const sessionsOnDay = createMemo(() =>
        groupChoices(
            filterChoices(props.choices, {
                track: track(),
                drivers: driverFilter(),
                dayStart: day(),
                query: "",
            })
        )
    )

    const chooseTrack = (next: string) => {
        if (next === track()) return
        const first = groupByDay(
            filterChoices(props.choices, {
                track: next,
                drivers: [],
                dayStart: null,
                query: "",
            }).map(choice => choice.session)
        )[0]
        batch(() => {
            setTrack(next)
            setSelected([])
            setDriver(null)
            setDay(first?.start ?? 0)
        })
    }

    createEffect(() => {
        const current = driver()
        if (current === null) return
        if (!driversAvailable().includes(current)) setDriver(null)
    })

    createEffect(() => {
        const list = days()
        if (list.length === 0) return
        if (!list.some(item => item.start === day())) {
            setDay(list[0]!.start)
        }
    })

    const selectedChoices = createMemo(() =>
        selected().flatMap(id => {
            const choice = choiceById(id)
            return choice ? [choice] : []
        })
    )

    const canApply = () => selectedChoices().length > 0

    const dismiss = () => {
        if (props.mode === "edit") props.onDismiss()
    }

    onMount(() => {
        requestAnimationFrame(() => {
            document
                .querySelector<HTMLElement>('[aria-current="true"]')
                ?.scrollIntoView({ block: "nearest" })
        })
        if (props.mode !== "edit") return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            // Capture runs before the select; leave Escape to the open popup.
            if (floatingMenuOpen()) return
            props.onDismiss()
        }
        document.addEventListener("keydown", onKey, true)
        onCleanup(() => document.removeEventListener("keydown", onKey, true))
    })

    return (
        <Portal>
            <div
                class="fixed-screen z-50 flex items-start justify-center overflow-hidden bg-ink/30 px-6 pt-36 pb-6"
                onClick={dismiss}
            >
                <div
                    class="flex w-full max-w-5xl flex-col overflow-hidden rounded border border-line bg-surface p-5 text-ink shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)]"
                    style={{
                        height: "min(42rem, calc(100dvh / var(--ui-zoom) - 12rem))",
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="telemetry-pick-title"
                    onClick={event => event.stopPropagation()}
                >
                    <h2
                        id="telemetry-pick-title"
                        class="shrink-0 font-mono text-lg font-medium tracking-wide uppercase"
                    >
                        {t("app.telemetryPickTitle")}
                    </h2>
                    <div class="mt-4 grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        <label class="flex min-w-0 flex-col gap-1.5">
                            <span class="font-mono text-sm font-semibold tracking-wide text-muted uppercase">
                                {t("app.telemetryPickTrack")}
                            </span>
                            <TrackMenu
                                tracks={tracks()}
                                value={track()}
                                onChange={chooseTrack}
                            />
                        </label>
                        <Show when={track()}>
                            <label class="flex min-w-0 flex-col gap-1.5">
                                <span class="font-mono text-sm font-semibold tracking-wide text-muted uppercase">
                                    {t("app.telemetryPickDriver")}
                                </span>
                                <DriverMenu
                                    drivers={driversAvailable()}
                                    value={driver()}
                                    onChange={setDriver}
                                />
                            </label>
                        </Show>
                    </div>
                    <Show
                        when={track()}
                        fallback={
                            <p class="mt-4 flex min-h-0 flex-1 items-center justify-center rounded border border-dashed border-line bg-inset px-4 text-center font-mono text-base text-secondary">
                                {t("app.telemetryPickTrackPlaceholder")}
                            </p>
                        }
                    >
                        <div class="mt-4 grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] items-stretch gap-3 overflow-hidden md:grid-cols-[minmax(0,1fr)_18rem] md:grid-rows-1">
                            <LapChecklist
                                days={days()}
                                day={day()}
                                groups={sessionsOnDay()}
                                selected={selected()}
                                onDay={setDay}
                                onToggle={lapId =>
                                    setSelected(toggleLapId(selected(), lapId))
                                }
                            />
                            <SelectedLaps
                                choices={selectedChoices()}
                                onMakeBaseline={index =>
                                    setSelected(
                                        makeBaselineId(selected(), index)
                                    )
                                }
                                onRemove={lapId =>
                                    setSelected(toggleLapId(selected(), lapId))
                                }
                            />
                        </div>
                    </Show>
                    <div class="mt-4 flex shrink-0 flex-nowrap items-center gap-3 border-t border-line pt-4">
                        <p class="min-w-0 flex-1 truncate font-mono text-sm text-muted">
                            <Show when={track()}>
                                {t("app.telemetryPickLapsHint", {
                                    max: MAX_COMPARE_LAPS,
                                })}
                            </Show>
                        </p>
                        <div class="ml-auto flex shrink-0 gap-2">
                            <Button
                                variant="secondary"
                                class="h-10 px-4 text-sm"
                                onClick={() =>
                                    props.mode === "required"
                                        ? props.onLeave()
                                        : props.onDismiss()
                                }
                            >
                                {t("app.telemetryPickCancel")}
                            </Button>
                            <Button
                                class="h-10 px-4 text-sm"
                                disabled={!canApply()}
                                onClick={() => props.onConfirm(selected())}
                            >
                                {t("app.telemetryPickApply")}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    )
}

const LapChecklist = (props: {
    days: { start: number; sessions: Session[] }[]
    day: number
    groups: { session: Session; laps: Lap[] }[]
    selected: readonly string[]
    onDay: (start: number) => void
    onToggle: (lapId: string) => void
}) => (
    <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-line bg-surface">
        <header class="flex items-center justify-end gap-3 border-b border-line bg-inset/60 px-3 py-2">
            <Show when={props.days.length > 0}>
                <DayNav
                    compact
                    days={props.days}
                    value={props.day}
                    onChange={props.onDay}
                />
            </Show>
        </header>
        <ul class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
            <For each={props.groups}>
                {group => (
                    <li class="mb-1 last:mb-0">
                        <p class="px-2 pt-2 pb-1 font-mono text-sm tracking-wide text-muted">
                            {groupLabel(group.session)}
                        </p>
                        <ul class="flex flex-col gap-0.5">
                            <For each={group.laps}>
                                {lap => {
                                    const slot = () =>
                                        props.selected.indexOf(lap.id)
                                    const active = () => slot() >= 0
                                    const full = () =>
                                        !active() &&
                                        props.selected.length >=
                                            MAX_COMPARE_LAPS
                                    return (
                                        <li>
                                            <button
                                                type="button"
                                                role="checkbox"
                                                aria-checked={active()}
                                                disabled={full()}
                                                class={cn(
                                                    "flex w-full cursor-pointer items-center gap-3 rounded px-2 py-2 text-left font-mono text-base outline-none transition-colors",
                                                    active()
                                                        ? cn(
                                                              lapTone(slot())
                                                                  .soft,
                                                              "text-ink"
                                                          )
                                                        : "text-ink hover:bg-inset",
                                                    full() &&
                                                        "cursor-not-allowed opacity-40 hover:bg-transparent"
                                                )}
                                                aria-current={
                                                    active()
                                                        ? "true"
                                                        : undefined
                                                }
                                                onClick={() =>
                                                    props.onToggle(lap.id)
                                                }
                                            >
                                                <span
                                                    class={cn(
                                                        "grid size-5 shrink-0 place-items-center rounded-sm border text-xs font-semibold",
                                                        active()
                                                            ? cn(
                                                                  lapTone(
                                                                      slot()
                                                                  ).dot,
                                                                  "border-transparent text-surface"
                                                              )
                                                            : "border-line text-transparent"
                                                    )}
                                                >
                                                    {slot() + 1}
                                                </span>
                                                <span
                                                    class={cn(
                                                        "font-semibold",
                                                        active() &&
                                                            lapTone(slot()).text
                                                    )}
                                                >
                                                    L{lap.number}
                                                </span>
                                                <span class="ml-auto tabular-nums text-secondary">
                                                    {formatLapTime(lap.timeMs)}
                                                </span>
                                            </button>
                                        </li>
                                    )
                                }}
                            </For>
                        </ul>
                    </li>
                )}
            </For>
        </ul>
    </section>
)

const SelectedLaps = (props: {
    choices: readonly LapChoice[]
    onMakeBaseline: (index: number) => void
    onRemove: (lapId: string) => void
}) => (
    <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-line bg-surface">
        <header class="border-b border-line bg-inset/60 px-3 py-2">
            <h3 class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
                {t("app.telemetrySelectedLaps", {
                    n: props.choices.length,
                    max: MAX_COMPARE_LAPS,
                })}
            </h3>
        </header>
        <ul class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            <For each={props.choices}>
                {(choice, index) => (
                    <li class="flex items-center gap-2 rounded px-2 py-2 font-mono text-sm">
                        <span
                            class={cn(
                                "size-2.5 shrink-0 rounded-full",
                                lapTone(index()).dot
                            )}
                            aria-hidden="true"
                        />
                        <span class="min-w-0 flex-1">
                            <span
                                class={cn(
                                    "block truncate font-semibold",
                                    lapTone(index()).text
                                )}
                            >
                                {driverLabel(choice.session.driver)} · L
                                {choice.lap.number} ·{" "}
                                {formatLapTime(choice.lap.timeMs)}
                            </span>
                            <span class="block truncate text-xs text-muted">
                                {index() === 0
                                    ? t("app.telemetryBaseline")
                                    : fmt.clock(choice.session.startedAt)}
                            </span>
                        </span>
                        <Show when={index() > 0}>
                            <IconButton
                                label={t("app.telemetryMakeBaseline")}
                                onClick={() => props.onMakeBaseline(index())}
                            >
                                <ArrowLeftRight
                                    class="size-4"
                                    strokeWidth={1.75}
                                />
                            </IconButton>
                        </Show>
                        <IconButton
                            label={t("app.telemetryRemoveLap")}
                            onClick={() => props.onRemove(choice.lap.id)}
                        >
                            <X class="size-4" strokeWidth={1.75} />
                        </IconButton>
                    </li>
                )}
            </For>
        </ul>
    </section>
)

const IconButton = (props: {
    label: string
    onClick: () => void
    children: JSX.Element
    class?: string
    disabled?: boolean
}) => (
    <button
        type="button"
        class={cn(
            "grid size-7 shrink-0 cursor-pointer place-items-center rounded border border-line bg-inset text-muted outline-none hover:border-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted",
            props.class
        )}
        aria-label={props.label}
        title={props.label}
        disabled={props.disabled}
        onClick={() => props.onClick()}
    >
        {props.children}
    </button>
)

const CompareBanner = (props: {
    choices: LapChoice[]
    selected: readonly LapChoice[]
    onReplace: (index: number, lapId: string) => void
    onEdit?: () => void
    zones?: readonly DivergenceZone[]
    focus?: DivergenceZone
    onZone?: (zone: DivergenceZone) => void
    onZoneClose?: () => void
    layout?: ChannelLayout
    onToggleChannel?: (channel: AnalysisChannel) => void
}) => {
    const pickable = (ownId: string) =>
        props.choices.filter(
            item =>
                item.lap.id === ownId ||
                !props.selected.some(chosen => chosen.lap.id === item.lap.id)
        )

    return (
        <section class="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded border border-line bg-surface px-4 py-3">
            <div class="justify-self-start">
                <Show when={(props.zones?.length ?? 0) > 0}>
                    <DivergenceMenu
                        zones={props.zones ?? []}
                        focus={props.focus}
                        onOpen={zone => props.onZone?.(zone)}
                        onClose={() => props.onZoneClose?.()}
                    />
                </Show>
            </div>
            <div class="flex w-full min-w-0 flex-wrap items-center justify-center gap-2 font-mono text-base">
                <For each={props.selected}>
                    {(choice, index) => (
                        <div class="w-48 min-w-0">
                            <LapPicker
                                label={
                                    index() === 0
                                        ? t("app.telemetryBaseline")
                                        : `L${choice.lap.number}`
                                }
                                colorIndex={index()}
                                value={choice.lap.id}
                                choices={pickable(choice.lap.id)}
                                onChange={lapId =>
                                    props.onReplace(index(), lapId)
                                }
                            />
                        </div>
                    )}
                </For>
            </div>
            <div class="flex items-center gap-2 justify-self-end">
                <Show when={props.layout}>
                    {layout => (
                        <ChannelDrawer
                            layout={layout()}
                            onToggle={channel =>
                                props.onToggleChannel?.(channel)
                            }
                        />
                    )}
                </Show>
                <Show when={props.onEdit}>
                    <Button
                        variant="secondary"
                        class="h-9 px-3 text-sm"
                        onClick={props.onEdit}
                    >
                        {t("app.telemetryPickEdit")}
                    </Button>
                </Show>
            </div>
        </section>
    )
}

const LapPicker = (props: {
    label: string
    colorIndex: number
    value: string
    choices: LapChoice[]
    placeholder?: string
    onChange: (lapId: string) => void
}) => {
    const groups = createMemo(() => groupLapChoices(props.choices))
    const selected = createMemo(
        () => props.choices.find(item => item.lap.id === props.value)?.lap
    )
    const collection = createMemo(() =>
        createListCollection({
            items: [...props.choices],
            itemToValue: item => item.lap.id,
            itemToString: item => `L${item.lap.number}`,
        })
    )
    const tone = () => lapTone(props.colorIndex)

    return (
        <Select.Root
            collection={collection()}
            value={props.value ? [props.value] : []}
            disabled={props.choices.length === 0}
            positioning={screenPositioning({ placement: "bottom-start" })}
            onValueChange={details => {
                const next = details.value[0]
                if (next) props.onChange(next)
            }}
        >
            <Select.Control class="min-w-0 flex-1">
                <Select.Trigger
                    class={cn(
                        "inline-flex h-9 w-full min-w-0 max-w-full cursor-pointer items-center gap-2 rounded border border-line bg-inset px-3 text-left outline-none transition-colors hover:border-secondary focus-visible:border-ink",
                        "disabled:cursor-not-allowed disabled:hover:border-line",
                        tone().text
                    )}
                    aria-label={props.label}
                >
                    <span
                        class={cn("size-2.5 shrink-0 rounded-full", tone().dot)}
                        aria-hidden="true"
                    />
                    <span class="min-w-0 truncate text-base font-semibold">
                        <Show
                            when={selected()}
                            fallback={
                                <span class="text-muted">
                                    {props.placeholder ?? t("app.pickLap")}
                                </span>
                            }
                        >
                            {lap => (
                                <>
                                    L{lap().number} ·{" "}
                                    {formatLapTime(lap().timeMs)}
                                </>
                            )}
                        </Show>
                    </span>
                    <ChevronDown
                        class="ml-auto size-4 shrink-0 text-muted"
                        strokeWidth={2}
                    />
                </Select.Trigger>
            </Select.Control>
            <Portal>
                <Select.Positioner class={screenPopupClass}>
                    <Select.Content class="flex max-h-(--available-height) w-[min(22rem,calc(100vw/var(--ui-zoom)-2rem))] flex-col overflow-hidden rounded border border-line bg-surface shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none">
                        <div class="shrink-0 border-b border-line px-3 py-2">
                            <Select.Label class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
                                {props.label}
                            </Select.Label>
                        </div>
                        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                            <For each={groups()}>
                                {group => (
                                    <Select.ItemGroup class="mb-1.5 last:mb-0">
                                        <Select.ItemGroupLabel class="px-2 py-1.5 font-mono text-sm tracking-wide text-muted uppercase">
                                            {groupLabel(group.session)}
                                        </Select.ItemGroupLabel>
                                        <For each={group.choices}>
                                            {choice => (
                                                <Select.Item
                                                    item={choice}
                                                    class={cn(
                                                        "group flex cursor-pointer items-center justify-between gap-3 rounded px-2.5 py-2 text-left font-mono text-base text-ink outline-none data-highlighted:bg-inset",
                                                        tone().checked
                                                    )}
                                                >
                                                    <span class="font-semibold">
                                                        L{choice.lap.number}
                                                    </span>
                                                    <span class="tabular-nums text-secondary group-data-[state=checked]:text-inherit">
                                                        {formatLapTime(
                                                            choice.lap.timeMs
                                                        )}
                                                    </span>
                                                </Select.Item>
                                            )}
                                        </For>
                                    </Select.ItemGroup>
                                )}
                            </For>
                        </div>
                    </Select.Content>
                </Select.Positioner>
            </Portal>
        </Select.Root>
    )
}

const groupLapChoices = (
    choices: readonly LapChoice[]
): { session: Session; choices: LapChoice[] }[] => {
    const order: string[] = []
    const map = new Map<string, { session: Session; choices: LapChoice[] }>()
    for (const choice of choices) {
        let group = map.get(choice.session.id)
        if (!group) {
            group = { session: choice.session, choices: [] }
            map.set(choice.session.id, group)
            order.push(choice.session.id)
        }
        group.choices.push(choice)
    }
    return order.map(id => map.get(id)!)
}

const groupChoices = (
    choices: readonly LapChoice[]
): { session: Session; laps: Lap[] }[] => {
    const order: string[] = []
    const map = new Map<string, { session: Session; laps: Lap[] }>()
    for (const choice of choices) {
        let group = map.get(choice.session.id)
        if (!group) {
            group = { session: choice.session, laps: [] }
            map.set(choice.session.id, group)
            order.push(choice.session.id)
        }
        group.laps.push(choice.lap)
    }
    return order.map(id => map.get(id)!)
}

const driverLabel = (driver: string): string =>
    driver.trim() === "" ? t("app.telemetryPickDriverUnknown") : driver

const groupLabel = (session: Session): string =>
    `${driverLabel(session.driver)} · ${fmt.clock(session.startedAt)} · ${sessionTypeLabel(session.type)} · ${carName(session.car)}`

const choiceLabel = (
    lap: Lap,
    session: Session,
    choices: readonly LapChoice[]
): string => {
    const sessions = new Set(choices.map(item => item.session.id))
    if (sessions.size <= 1) return `L${lap.number}`
    return `${fmt.clock(session.startedAt)} L${lap.number}`
}

const sessionTypeLabel = (type: SessionType): string => {
    switch (type) {
        case "practice":
            return t("app.typePractice")
        case "qualifying":
            return t("app.typeQualifying")
        case "race":
            return t("app.typeRace")
        case "hotlap":
            return t("app.typeHotlap")
        case "hotstint":
            return t("app.typeHotstint")
        case "hotlapSuperpole":
            return t("app.typeHotlapSuperpole")
        case "timeAttack":
            return t("app.typeTimeAttack")
        case "drift":
            return t("app.typeDrift")
        case "drag":
            return t("app.typeDrag")
        default:
            return t("app.typeUnknown")
    }
}

const searchText = (value: unknown): string | undefined => {
    const text = Array.isArray(value) ? value[0] : value
    return typeof text === "string" && text !== "" ? text : undefined
}

const formatLapTime = (ms: number | null | undefined): string =>
    ms == null ? t("app.empty") : fmt.lap(ms)

const loadCatalog = async (
    repo: SessionRepository
): Promise<Catalog | undefined> => {
    const sessions = await repo.readSessions()
    if (sessions.length === 0) return undefined

    const ordered = [...sessions].sort(
        (left, right) => right.startedAt - left.startedAt
    )

    const choices: LapChoice[] = []
    const sessionLaps = new Map<string, Lap[]>()
    for (const item of ordered) {
        const laps = await repo.readLaps(item.id)
        sessionLaps.set(
            item.id,
            [...laps].sort((left, right) => left.number - right.number)
        )
        for (const lap of laps) {
            if (lap.timeMs !== null) {
                choices.push({ lap, session: item })
            }
        }
    }
    if (choices.length === 0) return undefined

    return { choices, sessionLaps }
}
