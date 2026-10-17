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
    isSessionFilter,
    type Lap,
    type Session,
    type SessionFilter,
    type SessionType,
} from "~/domain"
import { carName, fmt, t, trackName } from "~/i18n"
import { locale } from "~/i18n/locale"
import { Tabs, cn } from "~/ui"

type DaySession = {
    session: Session
    bestLap: Lap | undefined
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
            if (!repo) return []
            return readDaySessions(repo)
        }
    )

    return (
        <Switch>
            <Match when={sheet.error}>
                <SheetMessage text={errorText(sheet.error)} />
            </Match>
            <Match when={sheet()}>
                {loaded => (
                    <Show
                        when={loaded().length > 0}
                        fallback={<SheetMessage text={t("app.emptySheet")} />}
                    >
                        <PastSheet sessions={loaded()} />
                    </Show>
                )}
            </Match>
        </Switch>
    )
}

function PastSheet(props: { sessions: DaySession[] }) {
    const [filter, setFilter] = createSignal<SessionFilter>("all")
    const rows = () =>
        closedSheet(
            props.sessions.map(row => row.session),
            filter()
        ).flatMap(item => (item.kind === "session" ? [item] : []))
    const bestLap = (sessionId: string) =>
        props.sessions.find(row => row.session.id === sessionId)?.bestLap

    return (
        <section class="flex flex-col px-6 py-6">
            <header class="flex flex-wrap items-center justify-between gap-4">
                <h1 class="font-mono text-lg font-semibold tracking-tight text-ink">
                    {dayTitle()}
                </h1>
                <SessionTypeFilter value={filter()} onChange={setFilter} />
            </header>
            <Show when={rows().length > 0}>
                <ul class="mt-6 border-t border-line">
                    <For each={rows()}>
                        {item => (
                            <ClosedRow
                                session={item.session}
                                bestLap={bestLap(item.session.id)}
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

async function readDaySessions(repo: SessionRepository): Promise<DaySession[]> {
    const items = await repo.readDay()
    const sessions = items.flatMap(item =>
        item.kind === "session" ? [item.session] : []
    )
    return Promise.all(
        sessions.map(async session => ({
            session,
            bestLap: fastestValidLap(await repo.readLaps(session.id)),
        }))
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

function dayTitle(): string {
    return new Intl.DateTimeFormat(locale(), {
        day: "numeric",
        month: "long",
    }).format(new Date())
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
