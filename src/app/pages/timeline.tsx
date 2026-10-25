import { A } from "@solidjs/router"
import {
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    onMount,
    untrack,
} from "solid-js"
import { accLink, accPresence } from "~/app/status"
import { useSessionRepository } from "~/db"
import {
    SESSION_FILTERS,
    closedSheet,
    groupByDay,
    isSessionFilter,
    trackRecords,
    type Lap,
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
    let appliedRevision = -1

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
                        const hasPast = () => sheet().past.length > 0
                        return (
                            <div class="flex min-h-0 flex-1 flex-col">
                                <div
                                    class={cn(
                                        "shrink-0 overflow-y-auto",
                                        hasPast()
                                            ? "max-h-[calc(100%-12rem)]"
                                            : "max-h-full"
                                    )}
                                >
                                    <Show
                                        when={live()}
                                        fallback={
                                            <TrackBoard records={records()} />
                                        }
                                    >
                                        <LiveCard card={live()!} />
                                    </Show>
                                </div>
                                <Show when={hasPast()}>
                                    <PastSheet sessions={sheet().past} />
                                </Show>
                            </div>
                        )
                    }}
                </Match>
            </Switch>
        </div>
    )
}

function PastSheet(props: { sessions: DaySession[] }) {
    const repository = useSessionRepository()
    const [filter, setFilter] = createSignal<SessionFilter>("all")
    const [chosen, setChosen] = createSignal<number>()
    const [confirming, setConfirming] = createSignal(false)
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
            <div class="mt-6 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                <Show when={sessions().length > 0}>
                    <ul class="border-t border-line">
                        <For each={sessions()}>
                            {session => (
                                <ClosedRow
                                    session={session}
                                    bestLap={bestLap(session.id)}
                                />
                            )}
                        </For>
                    </ul>
                </Show>
                <div class="flex justify-center border-t border-line py-4">
                    <Button
                        variant="danger"
                        onClick={() => setConfirming(true)}
                    >
                        {t("app.clearData")}
                    </Button>
                </div>
            </div>
            <Show when={confirming()}>
                <ClearDataDialog
                    onCancel={() => setConfirming(false)}
                    onConfirm={async () => {
                        const repo = repository()
                        if (!repo) return
                        try {
                            await repo.clearAll()
                            setConfirming(false)
                        } catch (error) {
                            const detail =
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            window.alert(`${t("app.clearDataFailed")}\n${detail}`)
                        }
                    }}
                />
            </Show>
        </section>
    )
}

function ClearDataDialog(props: {
    onCancel: () => void
    onConfirm: () => Promise<void>
}) {
    const [clearing, setClearing] = createSignal(false)
    let cancel: HTMLButtonElement | undefined

    const dismiss = () => {
        if (clearing()) return
        props.onCancel()
    }

    const confirm = () => {
        if (clearing()) return
        setClearing(true)
        void props.onConfirm().finally(() => setClearing(false))
    }

    onMount(() => {
        cancel?.focus()
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") dismiss()
        }
        document.addEventListener("keydown", onKey)
        onCleanup(() => document.removeEventListener("keydown", onKey))
    })

    return (
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-6"
            onClick={dismiss}
        >
            <div
                class="w-full max-w-md rounded border border-line bg-surface p-6 text-ink shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="clear-data-title"
                aria-describedby="clear-data-body"
                onClick={event => event.stopPropagation()}
            >
                <h2
                    id="clear-data-title"
                    class="font-mono text-sm font-medium tracking-wide text-ink uppercase"
                >
                    {t("app.clearDataTitle")}
                </h2>
                <p
                    id="clear-data-body"
                    class="mt-3 font-mono text-sm leading-5 text-secondary"
                >
                    {t("app.clearDataBody")}
                </p>
                <div class="mt-5 flex justify-end gap-2">
                    <Button
                        ref={cancel}
                        variant="secondary"
                        disabled={clearing()}
                        onClick={dismiss}
                    >
                        {t("app.clearDataCancel")}
                    </Button>
                    <Button
                        variant="danger"
                        disabled={clearing()}
                        onClick={confirm}
                    >
                        {t("app.clearDataConfirm")}
                    </Button>
                </div>
            </div>
        </div>
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

function ClosedRow(props: { session: Session; bestLap: Lap | undefined }) {
    const href = () => {
        const lap = countableLap(props.bestLap)
        if (!lap) return undefined
        return `/sessions/${props.session.id}/laps/${lap.id}`
    }

    return (
        <li class="border-b border-line">
            <Show
                when={href()}
                fallback={
                    <div class={rowClass}>
                        <RowContent
                            session={props.session}
                            bestLap={props.bestLap}
                        />
                    </div>
                }
            >
                {link => (
                    <A
                        href={link()}
                        class={cn(
                            rowClass,
                            "rounded outline-none hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20"
                        )}
                    >
                        <RowContent
                            session={props.session}
                            bestLap={props.bestLap}
                        />
                    </A>
                )}
            </Show>
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
                    {trackName(session().track)}
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
