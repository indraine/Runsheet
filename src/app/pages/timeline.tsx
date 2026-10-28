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
import { isGameOff, LaunchAccButton } from "~/app/launch-acc"
import {
    isSessionListSort,
    SESSION_LIST_SORTS,
    sessionListSort,
    setSessionListSort,
    type SessionListSort,
} from "~/app/session-list-sort"
import { accLink, accPresence } from "~/app/status"
import { useSessionRepository } from "~/db"
import {
    SESSION_FILTERS,
    closedSheet,
    groupByDay,
    isSessionFilter,
    liveCard,
    trackRecords,
    type Lap,
    type LiveCard as LiveCardModel,
    type Session,
    type SessionFilter,
    type SessionType,
} from "~/domain"
import { carName, fmt, t, trackName } from "~/i18n"
import { Button, Tabs, cn } from "~/ui"
import { DayNav, activeDayStart } from "~/app/pages/day-nav"
import {
    applyDayWrite,
    projectDay,
    readStableDay,
    type DayMemory,
    type DaySession,
} from "~/app/pages/day-memory"
import { LiveCard } from "~/app/pages/live-card"
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
                                presence === "inPits"
                            ) {
                                return sheet().live
                            }
                            return undefined
                        }
                        const shown = () => review() ?? live()
                        const hasPast = () => sheet().past.length > 0
                        const splitTop = () =>
                            shown()
                                ? "h-[calc(100%-12rem)] max-h-[32rem]"
                                : "max-h-[calc(100%-12rem)]"
                        return (
                            <div class="flex min-h-0 flex-1 flex-col">
                                <div
                                    class={cn(
                                        "flex min-h-0 shrink-0 flex-col overflow-hidden px-6 pt-6",
                                        !hasPast() && shown()
                                            ? "pb-0"
                                            : undefined,
                                        splitTop()
                                    )}
                                >
                                    <Show
                                        when={shown()}
                                        fallback={
                                            <TrackBoard records={records()} />
                                        }
                                    >
                                        <LiveCard card={shown()!} />
                                    </Show>
                                </div>
                                <Show when={hasPast()}>
                                    <PastSheet
                                        sessions={sheet().past}
                                        openedId={review()?.session.id}
                                        onShowLive={showSession}
                                    />
                                </Show>
                                <Show when={!hasPast() && shown()}>
                                    <AwaitingFirstRecord />
                                </Show>
                                <Show when={!hasPast() && !shown()}>
                                    <EmptyPast />
                                </Show>
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
        <section class="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-6">
            <div class="flex min-h-0 flex-1 flex-col items-center justify-center rounded border border-line bg-surface px-6 py-12 text-center">
                <h2 class="font-mono text-sm font-medium tracking-wide text-ink uppercase">
                    {t("app.emptyPastTitle")}
                </h2>
                <p class="mt-3 max-w-md font-mono text-sm leading-5 text-secondary">
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
        <section class="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-6">
            <div class="flex min-h-0 flex-1 flex-col items-center justify-center rounded border border-line bg-surface px-6 py-12 text-center">
                <h2 class="font-mono text-sm font-medium tracking-wide text-ink uppercase">
                    {t("app.awaitingFirstTitle")}
                </h2>
                <p class="mt-3 max-w-md font-mono text-sm leading-5 text-secondary">
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

    return (
        <section class="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-6">
            <header class="flex shrink-0 flex-wrap items-center justify-between gap-4">
                <Show when={selected()}>
                    {start => (
                        <DayNav
                            days={days()}
                            value={start()}
                            onChange={setChosen}
                        />
                    )}
                </Show>
                <div class="ml-auto flex flex-wrap items-center gap-3">
                    <SessionSortFilter
                        value={sessionListSort()}
                        onChange={setSessionListSort}
                    />
                    <SessionTypeFilter value={filter()} onChange={setFilter} />
                </div>
            </header>
            <Show when={sessions().length > 0}>
                <div class="mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded border border-line bg-surface [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                    <table class="w-full border-collapse text-left">
                        <thead class="sticky top-0 z-10 border-b border-line bg-surface">
                            <tr class="font-mono text-[10px] font-medium tracking-wide text-secondary uppercase">
                                <th class="px-4 py-2.5 font-medium">
                                    {t("app.colTime")}
                                </th>
                                <th class="px-4 py-2.5 font-medium">
                                    {t("app.colTrack")}
                                </th>
                                <th class="px-4 py-2.5 font-medium">
                                    {t("app.colType")}
                                </th>
                                <th class="px-4 py-2.5 font-medium">
                                    {t("app.colDriver")}
                                </th>
                                <th class="px-4 py-2.5 font-medium">
                                    {t("app.colCar")}
                                </th>
                                <th class="px-4 py-2.5 font-medium">
                                    {t("app.bestLap")}
                                </th>
                                <th class="px-4 py-2.5 font-medium">
                                    <span class="sr-only">
                                        {t("app.compare")}
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={sessions()}>
                                {session => (
                                    <ClosedRow
                                        session={session}
                                        bestLap={bestLap(session.id)}
                                        opened={props.openedId === session.id}
                                        onShow={() => props.onShowLive(session)}
                                    />
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>
        </section>
    )
}

function SessionSortFilter(props: {
    value: SessionListSort
    onChange: (value: SessionListSort) => void
}) {
    return (
        <Tabs.Root
            value={props.value}
            onValueChange={details => {
                if (isSessionListSort(details.value))
                    props.onChange(details.value)
            }}
        >
            <Tabs.List aria-label={t("app.sessionSort")}>
                <For each={SESSION_LIST_SORTS}>
                    {sort => (
                        <Tabs.Trigger value={sort}>
                            {sessionSortLabel(sort)}
                        </Tabs.Trigger>
                    )}
                </For>
            </Tabs.List>
        </Tabs.Root>
    )
}

function SessionTypeFilter(props: {
    value: SessionFilter
    onChange: (value: SessionFilter) => void
}) {
    return (
        <Tabs.Root
            value={props.value}
            onValueChange={details => {
                if (isSessionFilter(details.value))
                    props.onChange(details.value)
            }}
        >
            <Tabs.List aria-label={t("app.sessionFilter")}>
                <For each={SESSION_FILTERS}>
                    {filter => (
                        <Tabs.Trigger value={filter}>
                            {filterLabel(filter)}
                        </Tabs.Trigger>
                    )}
                </For>
            </Tabs.List>
        </Tabs.Root>
    )
}

function ClosedRow(props: {
    session: Session
    bestLap: Lap | undefined
    opened: boolean
    onShow: () => void
}) {
    const navigate = useNavigate()
    const compare = () => {
        const params = new URLSearchParams({
            session: props.session.id,
            track: props.session.track,
        })
        const lap = props.bestLap
        if (lap && lap.timeMs !== null) params.set("lap", lap.id)
        navigate(`/telemetry?${params.toString()}`)
    }
    const lap = () => countableLap(props.bestLap)

    return (
        <tr
            class={cn(
                "group border-b border-line last:border-b-0 hover:bg-inset",
                props.opened && "bg-inset"
            )}
        >
            <td class="px-4 py-2.5 whitespace-nowrap">
                <time
                    class="font-mono text-sm font-medium text-ink"
                    datetime={new Date(props.session.startedAt).toISOString()}
                >
                    {fmt.clock(props.session.startedAt)}
                </time>
            </td>
            <td class="max-w-40 truncate px-4 py-2.5 font-mono text-[13px] text-ink select-text">
                {trackName(props.session.track)}
            </td>
            <td class="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap text-ink">
                {props.session.online ? t("app.online") : t("app.solo")}
                <span class="text-muted" aria-hidden="true">
                    {" · "}
                </span>
                {sessionTypeLabel(props.session.type)}
            </td>
            <td class="max-w-36 truncate px-4 py-2.5 font-mono text-[13px] text-secondary select-text">
                {props.session.driver || t("app.empty")}
            </td>
            <td class="max-w-44 truncate px-4 py-2.5 font-mono text-[13px] text-secondary select-text">
                {carName(props.session.car)}
            </td>
            <td class="px-4 py-2.5 font-mono text-[13px] font-semibold whitespace-nowrap text-ink">
                {bestLapText(lap())}
            </td>
            <td class="px-4 py-2.5">
                <div class="flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
                    <Button variant="secondary" size="sm" onClick={compare}>
                        {t("app.compare")}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        class={cn(
                            "group-hover:bg-inset",
                            props.opened && "border-accent bg-inset text-accent"
                        )}
                        aria-pressed={props.opened}
                        aria-label={
                            props.opened
                                ? t("app.showTracks")
                                : t("app.showLiveCard")
                        }
                        onClick={() => props.onShow()}
                    >
                        <span class="grid">
                            <span
                                class={cn(
                                    "col-start-1 row-start-1 whitespace-nowrap",
                                    props.opened && "invisible"
                                )}
                                aria-hidden="true"
                            >
                                {t("app.showLiveCard")}
                            </span>
                            <span
                                class={cn(
                                    "col-start-1 row-start-1 whitespace-nowrap",
                                    !props.opened && "invisible"
                                )}
                                aria-hidden="true"
                            >
                                {t("app.showTracks")}
                            </span>
                        </span>
                    </Button>
                </div>
            </td>
        </tr>
    )
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
