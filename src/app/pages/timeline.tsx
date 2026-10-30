import { useNavigate } from "@solidjs/router"
import {
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    untrack,
} from "solid-js"
import { AdaptiveTabs } from "~/app/adaptive-tabs"
import { homeLayout } from "~/app/home-layout"
import { isGameOff, LaunchAccButton } from "~/app/launch-acc"
import {
    SESSION_LIST_SORTS,
    sessionListSort,
    setSessionListSort,
    type SessionListSort,
} from "~/app/session-list-sort"
import { sessionColumns, type SessionColumn } from "~/app/session-columns"
import { accLink, accPresence } from "~/app/status"
import { useSessionRepository } from "~/db"
import {
    SESSION_FILTERS,
    closedSheet,
    groupByDay,
    liveCard,
    trackRecords,
    type Lap,
    type LiveCard as LiveCardModel,
    type Session,
    type SessionFilter,
    type SessionType,
} from "~/domain"
import { carName, fmt, t, trackName } from "~/i18n"
import { cn } from "~/ui"
import { DayNav, activeDayStart } from "~/app/pages/day-nav"
import {
    applyDayWrite,
    projectDay,
    readStableDay,
    type DayMemory,
    type DaySession,
} from "~/app/pages/day-memory"
import { LiveCard } from "~/app/pages/live-card"
import { HomeSplit, PaneToggle } from "~/app/pages/home-split"
import { ColumnsMenu, SessionContextMenu } from "~/app/pages/session-menus"
import { TrackBoard } from "~/app/pages/track-board"

export function TimelinePage() {
    const repository = useSessionRepository()
    const [memory, setMemory] = createSignal<DayMemory>()
    const [failed, setFailed] = createSignal<unknown>()
    const [review, setReview] = createSignal<LiveCardModel>()
    let appliedRevision = -1
    let reviewToken = 0

    const showSession = (session: Session) => {
        if (review()?.session.id === session.id) {
            reviewToken += 1
            setReview(undefined)
            return
        }
        const repo = repository()
        if (!repo) return
        const token = ++reviewToken
        void repo
            .readLaps(session.id)
            .then(async laps => {
                const traces = await repo.readTraces(laps.map(lap => lap.id))
                return liveCard(session, laps, [...traces.values()])
            })
            .then(card => {
                if (token !== reviewToken) return
                setReview(card)
            })
            .catch(error => {
                if (token !== reviewToken) return
                const detail =
                    error instanceof Error ? error.message : String(error)
                window.alert(`${t("app.showLiveFailed")}\n${detail}`)
            })
    }

    createEffect(() => {
        const card = review()
        const current = memory()
        if (!card || !current) return
        if (!current.past.some(row => row.session.id === card.session.id)) {
            setReview(undefined)
        }
    })

    createEffect(() => {
        const repo = repository()
        if (!repo) return
        let stopped = false
        onCleanup(() => {
            stopped = true
        })
        void readStableDay(
            repo,
            untrack(() => accLink().sessionId)
        )
            .then(loaded => {
                if (stopped) return
                const sessionId = untrack(() => accLink().sessionId)
                let next = loaded.memory
                let revision = loaded.revision
                const pending = repo.lastWrite()
                if (pending && repo.revision() !== loaded.revision) {
                    next = applyDayWrite(next, pending, sessionId)
                    revision = repo.revision()
                }
                appliedRevision = revision
                setFailed(undefined)
                setMemory(next)
            })
            .catch(error => {
                if (!stopped) setFailed(error)
            })
    })

    createEffect(() => {
        const repo = repository()
        if (!repo) return
        const revision = repo.revision()
        const write = repo.lastWrite()
        if (revision === appliedRevision) return
        const current = memory()
        if (!current) return
        const sessionId = untrack(() => accLink().sessionId)
        if (!write || revision !== appliedRevision + 1) {
            let stopped = false
            onCleanup(() => {
                stopped = true
            })
            void readStableDay(repo, sessionId)
                .then(loaded => {
                    if (stopped) return
                    let next = loaded.memory
                    let nextRevision = loaded.revision
                    const pending = repo.lastWrite()
                    if (pending && repo.revision() !== loaded.revision) {
                        next = applyDayWrite(next, pending, sessionId)
                        nextRevision = repo.revision()
                    }
                    appliedRevision = nextRevision
                    setMemory(next)
                })
                .catch(error => {
                    if (!stopped) setFailed(error)
                })
            return
        }
        appliedRevision = revision
        setMemory(applyDayWrite(current, write, sessionId))
    })

    return (
        <div class="flex min-h-0 flex-1 flex-col">
            <Switch>
                <Match when={failed()}>
                    {error => <SheetMessage text={errorText(error())} />}
                </Match>
                <Match when={memory()}>
                    {loaded => {
                        const sheet = createMemo(() => projectDay(loaded()))
                        const records = createMemo(() =>
                            trackRecords(sheet().past)
                        )
                        const live = () => {
                            const presence = accPresence()
                            if (
                                presence === "onTrack" ||
                                presence === "inPits" ||
                                presence === "pause" ||
                                presence === "onGrid"
                            ) {
                                return sheet().live
                            }
                            return undefined
                        }
                        const shown = () => review() ?? live()
                        const hasPast = () => sheet().past.length > 0
                        // Without a table there is no button to restore it.
                        const expanded = () => {
                            const mode = homeLayout().expanded
                            return mode === "left" && !hasPast() ? "none" : mode
                        }
                        return (
                            <div class="flex min-h-0 flex-1 px-6 py-6">
                                <HomeSplit
                                    expanded={expanded()}
                                    left={
                                        <Show
                                            when={hasPast()}
                                            fallback={
                                                <Show
                                                    when={shown()}
                                                    fallback={<EmptyPast />}
                                                >
                                                    <AwaitingFirstRecord />
                                                </Show>
                                            }
                                        >
                                            <PastSheet
                                                sessions={sheet().past}
                                                openedId={review()?.session.id}
                                                onShowLive={showSession}
                                            />
                                        </Show>
                                    }
                                    right={
                                        <Show
                                            when={shown()}
                                            fallback={
                                                <TrackBoard
                                                    records={records()}
                                                />
                                            }
                                        >
                                            <LiveCard card={shown()!} />
                                        </Show>
                                    }
                                />
                            </div>
                        )
                    }}
                </Match>
            </Switch>
        </div>
    )
}

function EmptyPast() {
    return (
        <section class="flex min-h-0 flex-1 flex-col">
            <div class="flex min-h-0 flex-1 flex-col items-center justify-center rounded border border-line bg-surface px-6 py-12 text-center">
                <h2 class="text-sm font-medium tracking-wide text-ink uppercase">
                    {t("app.emptyPastTitle")}
                </h2>
                <p class="mt-3 max-w-md text-sm leading-5 text-secondary">
                    {t("app.emptyPastBody")}
                </p>
                <Show when={isGameOff()}>
                    <div class="mt-6">
                        <LaunchAccButton />
                    </div>
                </Show>
            </div>
        </section>
    )
}

function AwaitingFirstRecord() {
    return (
        <section class="flex min-h-0 flex-1 flex-col">
            <div class="flex min-h-0 flex-1 flex-col items-center justify-center rounded border border-line bg-surface px-6 py-12 text-center">
                <h2 class="text-sm font-medium tracking-wide text-ink uppercase">
                    {t("app.awaitingFirstTitle")}
                </h2>
                <p class="mt-3 max-w-md text-sm leading-5 text-secondary">
                    {t("app.awaitingFirstBody")}
                </p>
            </div>
        </section>
    )
}

function PastSheet(props: {
    sessions: DaySession[]
    openedId: string | undefined
    onShowLive: (session: Session) => void
}) {
    const [filter, setFilter] = createSignal<SessionFilter>("all")
    const [chosen, setChosen] = createSignal<number>()
    const days = () =>
        groupByDay(
            closedSheet(
                props.sessions.map(row => row.session),
                "all"
            ).flatMap(item => (item.kind === "session" ? [item.session] : []))
        )
    const selected = () => activeDayStart(days(), chosen(), Date.now())
    const sessions = () => {
        const day = days().find(item => item.start === selected())
        if (!day) return []
        const rows = closedSheet(day.sessions, filter()).flatMap(item =>
            item.kind === "session" ? [item.session] : []
        )
        const newestFirst = sessionListSort() === "newest"
        return [...rows].sort((left, right) =>
            newestFirst
                ? right.startedAt - left.startedAt
                : left.startedAt - right.startedAt
        )
    }
    const bestLap = (sessionId: string) =>
        props.sessions.find(row => row.session.id === sessionId)?.bestLap
    const [target, setTarget] = createSignal<string>()
    const targetSession = () =>
        sessions().find(session => session.id === target())
    const navigate = useNavigate()
    const compare = () => {
        const session = targetSession()
        if (!session) return
        const params = new URLSearchParams({
            session: session.id,
            track: session.track,
        })
        const lap = bestLap(session.id)
        if (lap && lap.timeMs !== null) params.set("lap", lap.id)
        navigate(`/telemetry?${params.toString()}`)
    }
    const toggleLive = () => {
        const session = targetSession()
        if (session) props.onShowLive(session)
    }

    return (
        <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-line bg-surface">
            <header class="@container shrink-0 border-b border-line px-4 py-3">
                <div class="flex items-center gap-x-3">
                    <Show when={selected()}>
                        {start => (
                            <DayNav
                                bar
                                days={days()}
                                value={start()}
                                onChange={setChosen}
                            />
                        )}
                    </Show>
                    <div class="ml-auto flex min-w-0 items-center gap-2">
                        <AdaptiveTabs
                            from="2xl"
                            items={SESSION_LIST_SORTS}
                            value={sessionListSort()}
                            onChange={setSessionListSort}
                            label={sessionSortLabel}
                            ariaLabel={t("app.sessionSort")}
                        />
                        <AdaptiveTabs
                            from="3xl"
                            items={SESSION_FILTERS}
                            value={filter()}
                            onChange={setFilter}
                            label={filterLabel}
                            ariaLabel={t("app.sessionFilter")}
                        />
                        <ColumnsMenu label={columnLabel} />
                        <PaneToggle pane="left" />
                    </div>
                </div>
            </header>
            <Show when={sessions().length > 0}>
                <SessionContextMenu
                    class="flex min-h-0 flex-1 flex-col"
                    opened={
                        target() !== undefined && props.openedId === target()
                    }
                    onTarget={setTarget}
                    onCompare={compare}
                    onToggleLive={toggleLive}
                >
                    <div class="min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                        <table class="w-full border-collapse text-left">
                            <thead class="sticky top-0 z-10 border-b border-line bg-surface">
                                <tr class="text-[12px] font-medium tracking-wide text-secondary uppercase">
                                    <For each={sessionColumns()}>
                                        {column => (
                                            <th class="px-4 py-2.5 font-medium whitespace-nowrap">
                                                {columnLabel(column)}
                                            </th>
                                        )}
                                    </For>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={sessions()}>
                                    {session => (
                                        <ClosedRow
                                            session={session}
                                            bestLap={bestLap(session.id)}
                                            opened={
                                                props.openedId === session.id
                                            }
                                        />
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </SessionContextMenu>
            </Show>
        </section>
    )
}

function columnLabel(column: SessionColumn): string {
    switch (column) {
        case "time":
            return t("app.colTime")
        case "track":
            return t("app.colTrack")
        case "type":
            return t("app.colType")
        case "driver":
            return t("app.colDriver")
        case "car":
            return t("app.colCar")
        case "best":
            return t("app.bestLap")
    }
}

function ClosedRow(props: {
    session: Session
    bestLap: Lap | undefined
    opened: boolean
}) {
    const lap = () => countableLap(props.bestLap)

    return (
        <tr
            data-session-id={props.session.id}
            class={cn(
                "cursor-context-menu border-b border-line last:border-b-0 hover:bg-inset",
                props.opened && "bg-inset"
            )}
        >
            <For each={sessionColumns()}>
                {column => (
                    <ClosedCell
                        column={column}
                        session={props.session}
                        lap={lap()}
                    />
                )}
            </For>
        </tr>
    )
}

function ClosedCell(props: {
    column: SessionColumn
    session: Session
    lap: (Lap & { timeMs: number }) | undefined
}) {
    switch (props.column) {
        case "time":
            return (
                <td class="px-4 py-2.5 whitespace-nowrap">
                    <time
                        class="font-mono text-sm font-medium text-ink"
                        datetime={new Date(
                            props.session.startedAt
                        ).toISOString()}
                    >
                        {fmt.clock(props.session.startedAt)}
                    </time>
                </td>
            )
        case "track":
            return (
                <td class="max-w-40 truncate px-4 py-2.5 text-sm text-ink select-text">
                    {trackName(props.session.track)}
                </td>
            )
        case "type":
            return (
                <td class="px-4 py-2.5 text-sm whitespace-nowrap text-ink">
                    {props.session.online ? t("app.online") : t("app.solo")}
                    <span class="text-muted" aria-hidden="true">
                        {" · "}
                    </span>
                    {sessionTypeLabel(props.session.type)}
                </td>
            )
        case "driver":
            return (
                <td class="max-w-36 truncate px-4 py-2.5 text-sm text-secondary select-text">
                    {props.session.driver || t("app.empty")}
                </td>
            )
        case "car":
            return (
                <td class="max-w-44 truncate px-4 py-2.5 text-sm text-secondary select-text">
                    {carName(props.session.car)}
                </td>
            )
        case "best":
            return (
                <td class="px-4 py-2.5 font-mono text-sm font-semibold whitespace-nowrap text-ink">
                    {bestLapText(props.lap)}
                </td>
            )
    }
}

function SheetMessage(props: { text: string }) {
    return (
        <p class="px-6 py-16 text-center font-sans text-sm leading-5 text-secondary">
            {props.text}
        </p>
    )
}

function bestLapText(lap: (Lap & { timeMs: number }) | undefined): string {
    return lap ? fmt.lap(lap.timeMs) : t("app.empty")
}

function countableLap(
    lap: Lap | undefined
): (Lap & { timeMs: number }) | undefined {
    if (!lap || lap.timeMs === null) return undefined
    return { ...lap, timeMs: lap.timeMs }
}

function filterLabel(filter: SessionFilter): string {
    switch (filter) {
        case "all":
            return t("app.filterAll")
        case "race":
            return t("app.filterRace")
        case "qualifying":
            return t("app.filterQualifying")
        case "practice":
            return t("app.filterPractice")
    }
}

function sessionSortLabel(sort: SessionListSort): string {
    switch (sort) {
        case "newest":
            return t("app.sessionSortNewest")
        case "oldest":
            return t("app.sessionSortOldest")
    }
}

function sessionTypeLabel(type: SessionType): string {
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
        case "unknown":
            return t("app.typeUnknown")
    }
}

function errorText(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return String(error)
}
