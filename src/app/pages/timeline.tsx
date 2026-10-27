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
import { locale } from "~/i18n/locale"
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

const rowClass = "flex items-baseline gap-6 px-2 py-3"

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
                        const live = () =>
                            accPresence() === "onTrack"
                                ? sheet().live
                                : undefined
                        const shown = () => review() ?? live()
                        const hasPast = () => sheet().past.length > 0
                        return (
                            <div class="flex min-h-0 flex-1 flex-col">
                                <div
                                    class={cn(
                                        "flex min-h-0 shrink-0 flex-col overflow-hidden px-6 pt-6",
                                        hasPast()
                                            ? shown()
                                                ? "h-[calc(100%-12rem)] max-h-[32rem]"
                                                : "max-h-[calc(100%-12rem)]"
                                            : "h-full"
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
                            </div>
                        )
                    }}
                </Match>
            </Switch>
        </div>
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
        return closedSheet(day.sessions, filter()).flatMap(item =>
            item.kind === "session" ? [item.session] : []
        )
    }
    const bestLap = (sessionId: string) =>
        props.sessions.find(row => row.session.id === sessionId)?.bestLap

    return (
        <section class="flex min-h-0 flex-1 flex-col px-6 pt-6">
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
                <div class="ml-auto">
                    <SessionTypeFilter value={filter()} onChange={setFilter} />
                </div>
            </header>
            <Show when={sessions().length > 0}>
                <div class="mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                    <ul class="border-t border-line pb-6">
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
                    </ul>
                </div>
            </Show>
        </section>
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

    return (
        <li
            class={cn(
                "group flex items-center border-b border-line pr-2 hover:bg-inset",
                props.opened && "bg-inset"
            )}
        >
            <div class={cn(rowClass, "min-w-0 flex-1")}>
                <RowContent session={props.session} bestLap={props.bestLap} />
            </div>
            <div class="flex shrink-0 items-center gap-2">
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
        </li>
    )
}

function RowContent(props: { session: Session; bestLap: Lap | undefined }) {
    const session = () => props.session
    const lap = () => countableLap(props.bestLap)

    return (
        <>
            <time
                class="w-14 shrink-0 font-mono text-sm font-medium text-ink"
                datetime={new Date(session().startedAt).toISOString()}
            >
                {fmt.clock(session().startedAt)}
            </time>
            <div class="min-w-0">
                <p class="truncate font-mono text-[13px] text-ink">
                    {session().online ? t("app.online") : t("app.solo")}
                    <Separator />
                    {sessionTypeLabel(session().type)}
                    <Separator />
                    <span class="select-text">{trackName(session().track)}</span>
                </p>
                <p class="mt-0.5 truncate font-mono text-[11px] text-secondary">
                    {carName(session().car)}
                    <Separator />
                    {carCountLabel(session().carCount)}
                    <Separator />
                    {t("app.bestLap")} {bestLapText(lap())}
                </p>
            </div>
        </>
    )
}

function Separator() {
    return (
        <span class="text-muted" aria-hidden="true">
            {" "}
            ·{" "}
        </span>
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

function carCountLabel(count: number): string {
    return `${count} ${carWord(count)}`
}

function carWord(count: number): string {
    if (locale() === "en") {
        return count === 1 ? t("app.carOne") : t("app.carMany")
    }
    const mod10 = count % 10
    const mod100 = count % 100
    if (mod10 === 1 && mod100 !== 11) return t("app.carOne")
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return t("app.carFew")
    }
    return t("app.carMany")
}

function errorText(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return String(error)
}
