import { Popover } from "@ark-ui/solid/popover"
import { useNavigate, useSearchParams } from "@solidjs/router"
import {
    batch,
    createEffect,
    createMemo,
    createResource,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
} from "solid-js"
import { Portal } from "solid-js/web"
import { ArrowLeftRight, ChevronDown } from "lucide-solid"
import { DayNav } from "~/app/pages/day-nav"
import { setAnalysisHeading } from "~/app/status"
import { ChannelView } from "~/app/telemetry/channel-view"
import {
    clearStoredComparison,
    primaryLapForSession,
    readStoredComparison,
    restoreComparison,
    writeStoredComparison,
} from "~/app/telemetry/compare-selection"
import {
    divergenceZones,
    zoneWindow,
    type DivergenceCause,
    type DivergenceZone,
} from "~/app/telemetry/divergence"
import { InstantHud } from "~/app/telemetry/instant-hud"
import {
    distanceSpan,
    sampleAtDistance,
    steerPeak,
} from "~/app/telemetry/sample"
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
    type Trace,
} from "~/domain"
import { carName, fmt, t, trackName } from "~/i18n"
import { Button, cn } from "~/ui"

export type LapChoice = {
    lap: Lap
    session: Session
}

type Catalog = {
    choices: LapChoice[]
    initialPrimaryId: string
    initialReferenceId: string | undefined
}

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
    const [primaryOverride, setPrimaryOverride] = createSignal(
        remembered?.primaryId
    )
    const [referenceOverride, setReferenceOverride] = createSignal(
        remembered?.referenceId
    )
    const [referenceTouched, setReferenceTouched] = createSignal(
        remembered !== undefined
    )

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
                setReferenceTouched(true)
                setReferenceOverride(undefined)
                setPrimaryOverride(primary?.id)
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
                setPrimaryOverride(undefined)
                setReferenceOverride(undefined)
                setReferenceTouched(false)
                setPickerOpen(true)
            })
            if (remembered) clearStoredComparison()
            return
        }
        batch(() => {
            setPrimaryOverride(restored.primaryId)
            setReferenceTouched(true)
            setReferenceOverride(restored.referenceId)
            setConfirmed(true)
            setPickerOpen(false)
        })
    })

    const primaryId = createMemo(() =>
        confirmed() ? primaryOverride() : undefined
    )
    const referenceId = createMemo(() => {
        const primary = primaryId()
        if (!primary) return undefined
        const list = choices()
        const primaryChoice = list.find(item => item.lap.id === primary)
        if (!primaryChoice) return undefined
        const sameTrack = list.filter(
            item => item.session.track === primaryChoice.session.track
        )
        const chosen = referenceTouched()
            ? referenceOverride()
            : catalog()?.initialReferenceId
        if (
            chosen &&
            chosen !== primary &&
            sameTrack.some(item => item.lap.id === chosen)
        ) {
            return chosen
        }
        return sameTrack.find(item => item.lap.id !== primary)?.lap.id
    })
    const primaryChoice = createMemo(() =>
        choices().find(item => item.lap.id === primaryId())
    )
    const trackChoices = createMemo(() => {
        const primary = primaryChoice()
        if (!primary) return []
        return choices().filter(
            item => item.session.track === primary.session.track
        )
    })
    const referenceChoice = createMemo(() =>
        choices().find(item => item.lap.id === referenceId())
    )

    createEffect(() => {
        if (!confirmed()) return
        const primary = primaryId()
        if (!primary) return
        writeStoredComparison({
            primaryId: primary,
            referenceId: referenceId(),
        })
    })

    const [traces] = createResource(
        () => {
            const repo = repository()
            const primary = primaryId()
            if (!repo || !primary) return undefined
            const reference = referenceId()
            const ids =
                reference && reference !== primary
                    ? [primary, reference]
                    : [primary]
            return { repo, ids }
        },
        source => source.repo.readTraces(source.ids)
    )

    const primaryTrace = createMemo(() => {
        const id = primaryId()
        return id ? traces()?.get(id) : undefined
    })
    const referenceTrace = createMemo(() => {
        const id = referenceId()
        return id ? traces()?.get(id) : undefined
    })
    const chartLines = createMemo((): TrajectoryLine[] => {
        const primary = primaryChoice()
        const reference = referenceChoice()
        const list = choices()
        const out: TrajectoryLine[] = []
        const primarySamples = primaryTrace()
        if (primary && primarySamples) {
            out.push({
                id: primary.lap.id,
                label: choiceLabel(primary.lap, primary.session, list),
                trace: primarySamples,
                role: "primary",
            })
        }
        const referenceSamples = referenceTrace()
        if (
            reference &&
            referenceSamples &&
            reference.lap.id !== primary?.lap.id
        ) {
            out.push({
                id: reference.lap.id,
                label: choiceLabel(reference.lap, reference.session, list),
                trace: referenceSamples,
                role: "reference",
            })
        }
        return out
    })

    createEffect(() => {
        const choice = primaryChoice()
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
        const span = distanceSpan(primaryTrace())
        if (!span) return
        const current = cursorM()
        if (current < span.min || current > span.max) {
            withProgrammaticCursor(() => {
                setCursorM(span.min + (span.max - span.min) * 0.3)
            })
        }
    })

    const primarySample = createMemo(() =>
        sampleAtDistance(primaryTrace(), cursorM())
    )
    const referenceSample = createMemo(() =>
        sampleAtDistance(referenceTrace(), cursorM())
    )
    const primarySteerPeak = createMemo(() => steerPeak(primaryTrace()))
    const referenceSteerPeak = createMemo(() => steerPeak(referenceTrace()))
    const zones = createMemo(() =>
        divergenceZones(primaryTrace(), referenceTrace())
    )
    const chartWindow = createMemo(() => {
        const zone = focus()
        if (!zone) return undefined
        const span =
            distanceSpan(primaryTrace()) ?? distanceSpan(referenceTrace())
        if (!span) return undefined
        return zoneWindow(zone, span)
    })
    const swapLaps = () => {
        const primary = primaryId()
        const reference = referenceId()
        if (!primary || !reference) return
        batch(() => {
            setPrimaryOverride(reference)
            setReferenceTouched(true)
            setReferenceOverride(primary)
        })
    }

    const selectPrimary = (lapId: string) => {
        if (lapId === primaryId()) return
        setPrimaryOverride(lapId)
    }

    const selectReference = (lapId: string) => {
        setReferenceTouched(true)
        setReferenceOverride(lapId)
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
        if (!primaryTrace()) return
        if (referenceId() && !referenceTrace()) return
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

    const pickerSeed = (): CompareSeed | undefined => {
        if (!confirmed()) {
            const sessionId = requestedSession()
            if (!sessionId) return undefined
            const lap = primaryLapForSession(
                choices().map(item => item.lap),
                sessionId,
                requestedLap()
            )
            const primary = lap
                ? choices().find(item => item.lap.id === lap.id)
                : undefined
            if (!primary) return undefined
            return { primary, reference: undefined }
        }
        const primary = primaryChoice()
        if (!primary) return undefined
        return { primary, reference: referenceChoice() }
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
                primary={confirmed() ? primaryChoice()?.lap : undefined}
                reference={confirmed() ? referenceChoice()?.lap : undefined}
                onPrimary={selectPrimary}
                onReference={selectReference}
                onSwap={swapLaps}
                onEdit={confirmed() ? () => setPickerOpen(true) : undefined}
                zones={zones()}
                focus={focus()}
                onZone={openZone}
                onZoneClose={() => setFocus(undefined)}
            />
            <Show
                when={primaryChoice()}
                fallback={
                    <Show when={!pickerOpen() && !catalog.loading}>
                        <p class="font-mono text-base text-secondary">
                            {t("app.telemetryMissing")}
                        </p>
                    </Show>
                }
            >
                {primary => (
                    <>
                        <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 overflow-hidden lg:grid-cols-12 lg:grid-rows-1">
                            <section class="flex min-h-0 flex-col gap-3 overflow-hidden rounded border border-line bg-surface p-4 lg:col-span-7">
                                <div class="flex min-h-0 flex-1 flex-col gap-2">
                                    <ChartStrip
                                        label={t("app.telemetryThrottle")}
                                        kind="throttle"
                                        primary={primaryTrace()}
                                        reference={referenceTrace()}
                                        cursorM={cursorM()}
                                        onCursor={setCursorM}
                                        distanceWindow={chartWindow()}
                                        zones={zones()}
                                        activeZone={focus()}
                                        onZone={openZone}
                                        onZoom={factor => zoomMap(factor)}
                                    />
                                    <ChartStrip
                                        label={t("app.telemetryBrake")}
                                        kind="brake"
                                        primary={primaryTrace()}
                                        reference={referenceTrace()}
                                        cursorM={cursorM()}
                                        onCursor={setCursorM}
                                        distanceWindow={chartWindow()}
                                        zones={zones()}
                                        activeZone={focus()}
                                        onZone={openZone}
                                        onZoom={factor => zoomMap(factor)}
                                    />
                                    <ChartStrip
                                        label={t("app.telemetrySteer")}
                                        kind="steer"
                                        primary={primaryTrace()}
                                        reference={referenceTrace()}
                                        cursorM={cursorM()}
                                        onCursor={setCursorM}
                                        distanceWindow={chartWindow()}
                                        zones={zones()}
                                        activeZone={focus()}
                                        onZone={openZone}
                                        onZoom={factor => zoomMap(factor)}
                                    />
                                    <ChartStrip
                                        label={t("app.telemetrySpeed")}
                                        kind="speed"
                                        primary={primaryTrace()}
                                        reference={referenceTrace()}
                                        cursorM={cursorM()}
                                        onCursor={setCursorM}
                                        distanceWindow={chartWindow()}
                                        zones={zones()}
                                        activeZone={focus()}
                                        onZone={openZone}
                                        onZoom={factor => zoomMap(factor)}
                                    />
                                </div>
                                <Show when={!traces.loading && !primaryTrace()}>
                                    <p class="font-mono text-sm text-muted">
                                        {t("app.telemetryNoTrace")}
                                    </p>
                                </Show>
                            </section>

                            <div class="flex min-h-0 flex-col gap-4 overflow-hidden lg:col-span-5">
                                <div class="relative min-h-0 flex-1 overflow-hidden rounded border border-line bg-inset">
                                    <TrajectoryView
                                        class="absolute inset-0"
                                        track={primary().session.track}
                                        lines={chartLines()}
                                        cursorM={cursorM()}
                                        onCursor={setCursorM}
                                        registerZoom={registerMapZoom}
                                    />
                                </div>

                                <InstantHud
                                    primary={primarySample()}
                                    reference={referenceSample()}
                                    primarySteerPeak={primarySteerPeak()}
                                    referenceSteerPeak={referenceSteerPeak()}
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
                    seed={pickerSeed()}
                    initialTrack={pickerTrack()}
                    onDismiss={() => setPickerOpen(false)}
                    onLeave={() => navigate("/")}
                    onConfirm={(primaryId, referenceId) => {
                        batch(() => {
                            setPrimaryOverride(primaryId)
                            setReferenceTouched(true)
                            setReferenceOverride(referenceId)
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

    return (
        <Popover.Root
            open={open()}
            onOpenChange={details => setOpen(details.open)}
            positioning={{ placement: "bottom-end", gutter: 8 }}
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
            <Popover.Positioner class="z-50">
                <Popover.Content class="w-64 overflow-hidden rounded border border-line bg-surface shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none">
                    <div class="border-b border-line px-3 py-2">
                        <Popover.Title class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
                            {t("app.telemetryDivergence")}
                        </Popover.Title>
                    </div>
                    <ul class="flex flex-col gap-0.5 p-1.5">
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
                                                active() ? "true" : undefined
                                            }
                                            onClick={() => {
                                                if (active()) props.onClose()
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
                        <div class="border-t border-line p-1.5">
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
        </Popover.Root>
    )
}

const ChartStrip = (props: {
    label: string
    kind: "throttle" | "brake" | "steer" | "speed"
    primary?: Trace
    reference?: Trace
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
                primary={props.primary}
                reference={props.reference}
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

type CompareSeed = {
    primary: LapChoice
    reference: LapChoice | undefined
}

const SwapGlyph = () => (
    <span class="grid place-items-center">
        <span class="col-start-1 row-start-1 group-hover:invisible group-focus-visible:invisible">
            vs
        </span>
        <ArrowLeftRight
            class="invisible col-start-1 row-start-1 size-4 group-hover:visible group-focus-visible:visible"
            strokeWidth={1.75}
        />
    </span>
)

const ComparePickerModal = (props: {
    choices: LapChoice[]
    mode: "required" | "edit"
    seed: CompareSeed | undefined
    initialTrack?: string
    onDismiss: () => void
    onLeave: () => void
    onConfirm: (primaryId: string, referenceId: string | undefined) => void
}) => {
    const groups = createMemo(() => groupChoices(props.choices))
    const tracks = createMemo(() => {
        const seen = new Set<string>()
        const list: string[] = []
        for (const group of groups()) {
            if (seen.has(group.session.track)) continue
            seen.add(group.session.track)
            list.push(group.session.track)
        }
        return list
    })
    const seed = props.seed
    const [track, setTrack] = createSignal(
        seed?.primary.session.track ?? props.initialTrack ?? ""
    )
    const [leftDay, setLeftDay] = createSignal(
        seed ? localDayStart(seed.primary.session.startedAt) : 0
    )
    const [rightDay, setRightDay] = createSignal(
        localDayStart(
            seed?.reference?.session.startedAt ??
                seed?.primary.session.startedAt ??
                0
        )
    )
    const [leftSessionId, setLeftSessionId] = createSignal(
        seed?.primary.session.id ?? ""
    )
    const [leftLapId, setLeftLapId] = createSignal(seed?.primary.lap.id ?? "")
    const [rightSessionId, setRightSessionId] = createSignal(
        seed?.reference?.session.id ?? ""
    )
    const [rightLapId, setRightLapId] = createSignal(
        seed?.reference?.lap.id ?? ""
    )
    let trackSelect: HTMLSelectElement | undefined

    const lapsOf = (sessionId: string) =>
        groups().find(group => group.session.id === sessionId)?.laps ?? []

    const onTrack = () =>
        groups().filter(group => group.session.track === track())

    const days = createMemo(() =>
        groupByDay(onTrack().map(group => group.session))
    )

    const sessionsOnDay = (start: number) =>
        onTrack().filter(
            group => localDayStart(group.session.startedAt) === start
        )

    const chooseTrack = (next: string) => {
        if (next === track()) return
        setTrack(next)
        const sessions = groups().filter(group => group.session.track === next)
        const first = sessions[0]
        if (!first) return
        setLeftDay(localDayStart(first.session.startedAt))
        chooseSession("a", first.session.id)
        const other =
            sessions.find(group =>
                group.laps.some(lap => lap.id !== leftLapId())
            ) ?? first
        setRightDay(localDayStart(other.session.startedAt))
        const otherLap =
            other.laps.find(lap => lap.id !== leftLapId()) ?? other.laps[0]
        setRightSessionId(other.session.id)
        setRightLapId(otherLap?.id ?? "")
    }

    const chooseDay = (side: "a" | "b", start: number) => {
        if (side === "a") setLeftDay(start)
        else setRightDay(start)
        const onDay = sessionsOnDay(start)
        const current = side === "a" ? leftSessionId() : rightSessionId()
        if (onDay.some(group => group.session.id === current)) return
        const next = onDay[0]
        if (next) chooseSession(side, next.session.id)
    }

    const lapSummary = (sessionId: string, lapId: string) => {
        const group = groups().find(item => item.session.id === sessionId)
        const lap = group?.laps.find(item => item.id === lapId)
        if (!lap) return t("app.pickLap")
        return `L${lap.number} · ${formatLapTime(lap.timeMs)}`
    }

    const pickLap = (side: "a" | "b", sessionId: string, lapId: string) => {
        if (side === "a") {
            setLeftSessionId(sessionId)
            setLeftLapId(lapId)
            return
        }
        setRightSessionId(sessionId)
        setRightLapId(lapId)
    }

    const chooseSession = (side: "a" | "b", sessionId: string) => {
        const laps = lapsOf(sessionId)
        const current = side === "a" ? leftLapId() : rightLapId()
        const kept = laps.some(lap => lap.id === current)
            ? current
            : fastestLap(laps)?.id
        if (side === "a") {
            setLeftSessionId(sessionId)
            if (kept) setLeftLapId(kept)
            return
        }
        setRightSessionId(sessionId)
        setRightLapId(kept ?? "")
    }

    const canApply = () => {
        const left = leftLapId()
        const right = rightLapId()
        if (left === "" || right === "" || right === left) return false
        const leftSession = groups().find(group =>
            group.laps.some(lap => lap.id === left)
        )
        const rightSession = groups().find(group =>
            group.laps.some(lap => lap.id === right)
        )
        return (
            leftSession?.session.track === track() &&
            rightSession?.session.track === track()
        )
    }

    const dismiss = () => {
        if (props.mode === "edit") props.onDismiss()
    }

    const swapSides = () => {
        const nextLeftDay = rightDay()
        const nextRightDay = leftDay()
        const nextLeftSession = rightSessionId()
        const nextRightSession = leftSessionId()
        const nextLeftLap = rightLapId()
        const nextRightLap = leftLapId()
        setLeftDay(nextLeftDay)
        setRightDay(nextRightDay)
        setLeftSessionId(nextLeftSession)
        setRightSessionId(nextRightSession)
        setLeftLapId(nextLeftLap)
        setRightLapId(nextRightLap)
    }

    onMount(() => {
        trackSelect?.focus()
        if (!seed && track()) {
            const first = days()[0]
            if (first) {
                setLeftDay(first.start)
                setRightDay(first.start)
            }
        }
        requestAnimationFrame(() => {
            document
                .querySelector<HTMLElement>('[aria-current="true"]')
                ?.scrollIntoView({ block: "nearest" })
        })
        if (props.mode !== "edit") return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            const calendarOpen = document.querySelector(
                "[data-scope='date-picker'][data-state='open']"
            )
            if (calendarOpen) return
            props.onDismiss()
        }
        document.addEventListener("keydown", onKey, true)
        onCleanup(() => document.removeEventListener("keydown", onKey, true))
    })

    return (
        <Portal>
            <div
                class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 px-6 pt-36 pb-6"
                onClick={dismiss}
            >
                <div
                    class="flex w-full max-w-4xl flex-col overflow-hidden rounded border border-line bg-surface p-5 text-ink shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)]"
                    style={{ height: "min(40rem, calc(100dvh - 12rem))" }}
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
                    <label class="mt-4 flex max-w-sm shrink-0 flex-col gap-1.5">
                        <span class="font-mono text-sm font-semibold tracking-wide text-muted uppercase">
                            {t("app.telemetryPickTrack")}
                        </span>
                        <select
                            ref={trackSelect}
                            class={cn(
                                "h-11 w-full cursor-pointer rounded border border-line bg-inset px-3 font-mono text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20",
                                track() ? "text-ink" : "text-muted"
                            )}
                            value={track()}
                            required
                            aria-required="true"
                            onChange={event => {
                                const next = event.currentTarget.value
                                if (next) chooseTrack(next)
                            }}
                        >
                            <option value="" disabled>
                                {t("app.telemetryPickTrackPlaceholder")}
                            </option>
                            <For each={tracks()}>
                                {code => (
                                    <option value={code}>
                                        {trackName(code)}
                                    </option>
                                )}
                            </For>
                        </select>
                    </label>
                    <Show
                        when={track()}
                        fallback={
                            <p class="mt-4 flex min-h-0 flex-1 items-center justify-center rounded border border-dashed border-line bg-inset px-4 text-center font-mono text-base text-secondary">
                                {t("app.telemetryPickTrackPlaceholder")}
                            </p>
                        }
                    >
                        <div class="mt-4 grid h-full min-h-0 flex-1 grid-cols-1 items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                            <LapCard
                                label={t("app.primaryLap")}
                                tone="a"
                                days={days()}
                                day={leftDay()}
                                groups={sessionsOnDay(leftDay())}
                                lapId={leftLapId()}
                                takenLapId={rightLapId()}
                                onDay={start => chooseDay("a", start)}
                                onLap={(sessionId, lapId) =>
                                    pickLap("a", sessionId, lapId)
                                }
                            />
                            <button
                                type="button"
                                class="group flex h-9 cursor-pointer items-center justify-center self-center rounded border border-line bg-inset px-2.5 font-mono text-sm text-muted outline-none hover:border-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20 md:size-10 md:rounded-full md:px-0"
                                aria-label={t("app.telemetrySwap")}
                                onClick={swapSides}
                            >
                                <SwapGlyph />
                            </button>
                            <LapCard
                                label={t("app.referenceLap")}
                                tone="b"
                                days={days()}
                                day={rightDay()}
                                groups={sessionsOnDay(rightDay())}
                                lapId={rightLapId()}
                                takenLapId={leftLapId()}
                                onDay={start => chooseDay("b", start)}
                                onLap={(sessionId, lapId) =>
                                    pickLap("b", sessionId, lapId)
                                }
                            />
                        </div>
                    </Show>
                    <div class="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                        <Show when={track()}>
                            <p class="font-mono text-base">
                                <span class="font-semibold text-lap-a">
                                    {lapSummary(leftSessionId(), leftLapId())}
                                </span>
                                <span class="mx-2 text-muted">vs</span>
                                <span class="font-semibold text-lap-b">
                                    {lapSummary(rightSessionId(), rightLapId())}
                                </span>
                            </p>
                        </Show>
                        <div class="ml-auto flex gap-2">
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
                                onClick={() =>
                                    props.onConfirm(
                                        leftLapId(),
                                        rightLapId() || undefined
                                    )
                                }
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

const LapCard = (props: {
    label: string
    tone: "a" | "b"
    days: { start: number; sessions: Session[] }[]
    day: number
    groups: { session: Session; laps: Lap[] }[]
    lapId: string
    takenLapId: string
    onDay: (start: number) => void
    onLap: (sessionId: string, lapId: string) => void
}) => (
    <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-line bg-surface">
        <header class="flex items-center justify-between gap-3 border-b border-line bg-inset/60 px-3 py-2">
            <h3
                class={cn(
                    "font-mono text-sm font-semibold tracking-wide uppercase",
                    props.tone === "a" ? "text-lap-a" : "text-lap-b"
                )}
            >
                {props.label}
            </h3>
            <DayNav
                compact
                days={props.days}
                value={props.day}
                onChange={props.onDay}
            />
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
                                    const active = () => lap.id === props.lapId
                                    const taken = () =>
                                        !active() && lap.id === props.takenLapId
                                    return (
                                        <li>
                                            <button
                                                type="button"
                                                disabled={taken()}
                                                class={cn(
                                                    "flex w-full cursor-pointer items-center justify-between gap-3 rounded px-2 py-2 text-left font-mono text-base outline-none transition-colors",
                                                    active()
                                                        ? props.tone === "a"
                                                            ? "bg-lap-a/15 text-ink"
                                                            : "bg-lap-b/15 text-ink"
                                                        : "text-ink hover:bg-inset",
                                                    taken() &&
                                                        "cursor-not-allowed opacity-40 hover:bg-transparent"
                                                )}
                                                aria-current={
                                                    active()
                                                        ? "true"
                                                        : undefined
                                                }
                                                onClick={() =>
                                                    props.onLap(
                                                        group.session.id,
                                                        lap.id
                                                    )
                                                }
                                            >
                                                <span
                                                    class={cn(
                                                        "font-semibold",
                                                        active() &&
                                                            (props.tone === "a"
                                                                ? "text-lap-a"
                                                                : "text-lap-b")
                                                    )}
                                                >
                                                    L{lap.number}
                                                </span>
                                                <span class="tabular-nums text-secondary">
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

const fastestLap = (laps: readonly Lap[]): Lap | undefined => {
    const ranked = laps.filter(lap => lap.valid && lap.timeMs !== null)
    const pool = ranked.length > 0 ? ranked : laps
    return [...pool].sort(
        (left, right) => (left.timeMs ?? Infinity) - (right.timeMs ?? Infinity)
    )[0]
}

const CompareBanner = (props: {
    choices: LapChoice[]
    primary: Lap | undefined
    reference: Lap | undefined
    onPrimary: (lapId: string) => void
    onReference: (lapId: string) => void
    onSwap?: () => void
    onEdit?: () => void
    zones?: readonly DivergenceZone[]
    focus?: DivergenceZone
    onZone?: (zone: DivergenceZone) => void
    onZoneClose?: () => void
}) => {
    const referenceChoices = () =>
        props.choices.filter(item => item.lap.id !== props.primary?.id)

    return (
        <section class="grid shrink-0 grid-cols-3 items-center gap-3 rounded border border-line bg-surface px-4 py-3">
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
            <div class="flex w-full min-w-0 items-center justify-center gap-3 font-mono text-base">
                <div class="min-w-0">
                    <LapPicker
                        label={t("app.primaryLap")}
                        tone="a"
                        value={props.primary?.id ?? ""}
                        choices={props.primary ? props.choices : []}
                        onChange={props.onPrimary}
                    />
                </div>
                <button
                    type="button"
                    class="group inline-flex h-9 shrink-0 cursor-pointer items-center rounded border border-line bg-inset px-2.5 font-mono text-base text-muted outline-none hover:border-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t("app.telemetrySwap")}
                    disabled={!props.primary || !props.reference}
                    onClick={() => props.onSwap?.()}
                >
                    <SwapGlyph />
                </button>
                <div class="min-w-0">
                    <LapPicker
                        label={t("app.referenceLap")}
                        tone="b"
                        value={props.reference?.id ?? ""}
                        choices={referenceChoices()}
                        onChange={props.onReference}
                    />
                </div>
            </div>
            <div class="justify-self-end">
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
    tone: "a" | "b"
    value: string
    choices: LapChoice[]
    onChange: (lapId: string) => void
}) => {
    const groups = createMemo(() => groupChoices(props.choices))
    const selected = createMemo(
        () => props.choices.find(item => item.lap.id === props.value)?.lap
    )
    const [open, setOpen] = createSignal(false)

    return (
        <Popover.Root
            open={open()}
            onOpenChange={details => setOpen(details.open)}
            positioning={{ placement: "bottom-start", gutter: 8 }}
        >
            <Popover.Trigger
                class={cn(
                    "inline-flex h-9 w-full min-w-0 max-w-full cursor-pointer items-center gap-2 rounded border border-line bg-inset px-3 text-left outline-none transition-colors hover:border-secondary focus-visible:border-ink",
                    "disabled:cursor-not-allowed disabled:hover:border-line",
                    props.tone === "a" ? "text-lap-a" : "text-lap-b"
                )}
                aria-label={props.label}
                disabled={props.choices.length === 0}
            >
                <span
                    class={cn(
                        "size-2.5 shrink-0 rounded-full",
                        props.tone === "a" ? "bg-lap-a" : "bg-lap-b"
                    )}
                    aria-hidden="true"
                />
                <span class="min-w-0 truncate text-base font-semibold">
                    <Show
                        when={selected()}
                        fallback={
                            <span class="text-muted">{t("app.pickLap")}</span>
                        }
                    >
                        {lap => (
                            <>
                                L{lap().number} · {formatLapTime(lap().timeMs)}
                            </>
                        )}
                    </Show>
                </span>
                <ChevronDown
                    class="size-4 shrink-0 text-muted"
                    strokeWidth={2}
                />
            </Popover.Trigger>
            <Popover.Positioner class="z-50">
                <Popover.Content class="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded border border-line bg-surface shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none">
                    <div class="border-b border-line px-3 py-2">
                        <Popover.Title class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
                            {props.label}
                        </Popover.Title>
                    </div>
                    <div class="max-h-72 overflow-y-auto overscroll-contain p-1.5 [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                        <For each={groups()}>
                            {group => (
                                <div class="mb-1.5 last:mb-0">
                                    <p class="px-2 py-1.5 font-mono text-sm tracking-wide text-muted uppercase">
                                        {groupLabel(group.session)}
                                    </p>
                                    <ul class="flex flex-col gap-0.5">
                                        <For each={group.laps}>
                                            {lap => {
                                                const active = () =>
                                                    lap.id === props.value
                                                return (
                                                    <li>
                                                        <button
                                                            type="button"
                                                            class={cn(
                                                                "flex w-full cursor-pointer items-center justify-between gap-3 rounded px-2.5 py-2 text-left font-mono text-base outline-none transition-colors",
                                                                active()
                                                                    ? props.tone ===
                                                                      "a"
                                                                        ? "bg-lap-a/15 text-lap-a"
                                                                        : "bg-lap-b/15 text-lap-b"
                                                                    : "text-ink hover:bg-inset"
                                                            )}
                                                            aria-current={
                                                                active()
                                                                    ? "true"
                                                                    : undefined
                                                            }
                                                            onClick={() => {
                                                                props.onChange(
                                                                    lap.id
                                                                )
                                                                setOpen(false)
                                                            }}
                                                        >
                                                            <span class="font-semibold">
                                                                L{lap.number}
                                                            </span>
                                                            <span
                                                                class={cn(
                                                                    "tabular-nums",
                                                                    active()
                                                                        ? undefined
                                                                        : "text-secondary"
                                                                )}
                                                            >
                                                                {formatLapTime(
                                                                    lap.timeMs
                                                                )}
                                                            </span>
                                                        </button>
                                                    </li>
                                                )
                                            }}
                                        </For>
                                    </ul>
                                </div>
                            )}
                        </For>
                    </div>
                </Popover.Content>
            </Popover.Positioner>
        </Popover.Root>
    )
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

const groupLabel = (session: Session): string =>
    `${fmt.clock(session.startedAt)} · ${sessionTypeLabel(session.type)} · ${carName(session.car)}`

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
    const newest = ordered[0]
    if (!newest) return undefined

    const choices: LapChoice[] = []
    for (const item of ordered) {
        const laps = await repo.readLaps(item.id)
        for (const lap of laps) {
            if (lap.timeMs !== null) {
                choices.push({ lap, session: item })
            }
        }
    }
    if (choices.length === 0) return undefined

    const newestRanked = choices
        .filter(
            item =>
                item.session.id === newest.id &&
                item.lap.valid &&
                item.lap.timeMs !== null
        )
        .sort(
            (left, right) =>
                (left.lap.timeMs ?? Infinity) - (right.lap.timeMs ?? Infinity)
        )
    const primary = newestRanked[0] ?? choices[0]
    if (!primary) return undefined

    const sameSessionRanked = choices
        .filter(
            item =>
                item.session.id === primary.session.id &&
                item.lap.valid &&
                item.lap.timeMs !== null &&
                item.lap.id !== primary.lap.id
        )
        .sort(
            (left, right) =>
                (left.lap.timeMs ?? Infinity) - (right.lap.timeMs ?? Infinity)
        )
    const reference =
        sameSessionRanked[0] ??
        choices.find(
            item =>
                item.lap.id !== primary.lap.id &&
                item.session.track === primary.session.track
        )

    return {
        choices,
        initialPrimaryId: primary.lap.id,
        initialReferenceId: reference?.lap.id,
    }
}
