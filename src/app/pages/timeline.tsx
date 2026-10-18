import { A } from "@solidjs/router"
import {
    For,
    Match,
    Show,
    Switch,
    createResource,
    createSignal,
} from "solid-js"
import { useSessionRepository, type SessionRepository } from "~/db"
import {
    SESSION_FILTERS,
    closedSheet,
    fastestValidLap,
    groupByDay,
    isSessionFilter,
    liveCard,
    type Lap,
    type LiveCard as LiveCardModel,
    type Session,
    type SessionFilter,
    type SessionType,
} from "~/domain"
import { carName, fmt, t, trackName } from "~/i18n"
import { locale } from "~/i18n/locale"
import { Tabs, cn } from "~/ui"
import { DayNav, activeDayStart } from "~/app/pages/day-nav"
import { LiveCard } from "~/app/pages/live-card"

type DaySession = {
    session: Session
    bestLap: Lap | undefined
}

type DaySheet = {
    past: DaySession[]
    live: LiveCardModel | undefined
}

const rowClass = "flex items-baseline gap-6 px-2 py-3"

export function TimelinePage() {
    const repository = useSessionRepository()
    const [sheet] = createResource(
        () => {
            const repo = repository()
            if (!repo) return undefined
            return repo.revision()
        },
        async () => {
            const repo = repository()
            if (!repo) return { past: [], live: undefined }
            return readDaySheet(repo)
        }
    )

    return (
        <div>
            <Switch>
                <Match when={sheet.error}>
                    <SheetMessage text={errorText(sheet.error)} />
                </Match>
                <Match when={sheet()}>
                    {loaded => (
                        <Show
                            when={loaded().past.length > 0 || loaded().live}
                            fallback={
                                <SheetMessage text={t("app.emptySheet")} />
                            }
                        >
                            <Show when={loaded().live}>
                                {card => <LiveCard card={card()} />}
                            </Show>
                            <Show when={loaded().past.length > 0}>
                                <PastSheet sessions={loaded().past} />
                            </Show>
                        </Show>
                    )}
                </Match>
            </Switch>
        </div>
    )
}

function PastSheet(props: { sessions: DaySession[] }) {
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
        <section class="px-6 py-6">
            <header class="flex flex-wrap items-center justify-between gap-4">
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
                <ul class="mt-6 border-t border-line">
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

async function readDaySheet(repo: SessionRepository): Promise<DaySheet> {
    const sessions = await repo.readSessions()
    const liveSession = sessions
        .filter(session => session.status === "live")
        .sort((left, right) => right.startedAt - left.startedAt)[0]
    const closed = sessions.filter(session => session.status === "closed")

    const [past, live] = await Promise.all([
        Promise.all(
            closed.map(async session => ({
                session,
                bestLap: fastestValidLap(await repo.readLaps(session.id)),
            }))
        ),
        liveSession ? readLiveCard(repo, liveSession) : undefined,
    ])

    return { past, live }
}

async function readLiveCard(
    repo: SessionRepository,
    session: Session
): Promise<LiveCardModel> {
    const laps = await repo.readLaps(session.id)
    const traces = await repo.readTraces(laps.map(lap => lap.id))
    return liveCard(session, laps, [...traces.values()])
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
