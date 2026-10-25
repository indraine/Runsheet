import { ChevronLeft, ChevronRight } from "lucide-solid"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { setTrackBoardSort, trackBoardSort } from "~/app/track-board-sort"
import { fitFrame } from "~/app/fit-ground"
import { boundariesFor } from "~/app/track-catalog"
import {
    isTrackSort,
    sortTracks,
    TRACK_SORTS,
    type TrackRecord,
    type TrackSort,
} from "~/domain"
import { fmt, t, trackCodes, trackName } from "~/i18n"
import { locale } from "~/i18n/locale"
import { buttonVariants, cn, Tabs } from "~/ui"


const PAGE_SIZE = 4
const OUTLINE_BOX = 100

const OUTLINE_PADDING = 4

const OUTLINE_POINTS = 360

const iconProps = {
    class: "size-4",
    strokeWidth: 1.75,
} as const


export const TrackBoard = (props: {
    records: ReadonlyMap<string, TrackRecord>
}) => {
    const [page, setPage] = createSignal(0)
    const ordered = createMemo(() =>
        sortTracks(trackCodes, props.records, trackBoardSort())
    )
    const pageCount = createMemo(() =>
        Math.max(1, Math.ceil(ordered().length / PAGE_SIZE))
    )
    const driven = () =>
        trackCodes.filter(track => props.records.has(track)).length
    const pageTracks = createMemo(() => {
        const start = page() * PAGE_SIZE
        return ordered().slice(start, start + PAGE_SIZE)
    })

    createEffect(() => {
        trackBoardSort()
        setPage(0)
    })

    createEffect(() => {
        const last = pageCount() - 1
        if (page() > last) setPage(last)
    })

    return (
        <section class="mx-6 mt-6 shrink-0 overflow-hidden rounded border border-line">
            <header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line bg-surface px-4 py-3">
                <div class="min-w-0">
                    <h2 class="font-mono text-lg font-semibold tracking-tight text-ink uppercase">
                        {t("app.trackBoard")}
                    </h2>
                    <p class="mt-0.5 font-mono text-[11px] text-secondary">
                        {t("app.trackBoardHint")}
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-4">
                    <p class="font-mono text-[11px] text-secondary">
                        <span class="text-[13px] text-ink">{driven()}</span> /{" "}
                        {trackCodes.length}{" "}
                        <span class="tracking-wide uppercase">
                            {t("app.trackBoardDriven")}
                        </span>
                    </p>
                    <TrackSortFilter
                        value={trackBoardSort()}
                        onChange={setTrackBoardSort}
                    />
                    <nav
                        class="flex items-center gap-1"
                        aria-label={t("app.trackBoardPages")}
                    >
                        <button
                            type="button"
                            class={buttonVariants({
                                variant: "ghost",
                                size: "icon",
                            })}
                            aria-label={t("app.trackBoardPrev")}
                            disabled={page() <= 0}
                            onClick={() => setPage(current => current - 1)}
                        >
                            <ChevronLeft {...iconProps} />
                        </button>
                        <p class="min-w-10 text-center font-mono text-[11px] text-secondary">
                            <span class="text-ink">{page() + 1}</span> /{" "}
                            {pageCount()}
                        </p>
                        <button
                            type="button"
                            class={buttonVariants({
                                variant: "ghost",
                                size: "icon",
                            })}
                            aria-label={t("app.trackBoardNext")}
                            disabled={page() >= pageCount() - 1}
                            onClick={() => setPage(current => current + 1)}
                        >
                            <ChevronRight {...iconProps} />
                        </button>
                    </nav>
                </div>
            </header>
            <ul class="grid grid-cols-4 divide-x divide-line bg-surface">
                <For each={pageTracks()}>
                    {track => (
                        <TrackTile
                            track={track}
                            record={props.records.get(track)}
                        />
                    )}
                </For>
            </ul>
        </section>
    )
}

const TrackSortFilter = (props: {
    value: TrackSort
    onChange: (value: TrackSort) => void
}) => (
    <Tabs.Root
        value={props.value}
        onValueChange={details => {
            if (isTrackSort(details.value)) props.onChange(details.value)
        }}
    >
        <Tabs.List aria-label={t("app.trackBoardSort")}>
            <For each={TRACK_SORTS}>
                {sort => (
                    <Tabs.Trigger value={sort}>{sortLabel(sort)}</Tabs.Trigger>
                )}
            </For>
        </Tabs.List>
    </Tabs.Root>
)

const TrackTile = (props: {
    track: string
    record: TrackRecord | undefined
}) => {
    const outline = outlinePath(props.track)
    const best = () => props.record?.bestLap?.timeMs ?? null
    const driven = () => props.record !== undefined

    return (
        <li class="flex aspect-[4/3] min-w-0 flex-col gap-1 px-4 pt-3 pb-4">
            <div class="flex items-baseline justify-between gap-3 font-mono">
                <p class="min-w-0 truncate text-[22px] font-semibold tracking-tight text-ink uppercase">
                    {trackName(props.track)}
                </p>
                <Show when={props.record}>
                    {record => (
                        <p class="shrink-0 text-right font-mono leading-tight">
                            <span class="block text-[15px] font-semibold tracking-tight text-ink">
                                {record().sessions}
                            </span>
                            <span class="block text-[10px] font-medium tracking-wide text-secondary uppercase">
                                {attemptWord(record().sessions)}
                            </span>
                        </p>
                    )}
                </Show>
            </div>
            <svg
                class={cn(
                    "min-h-0 w-full flex-1 py-1",
                    driven() ? "text-accent" : "text-muted"
                )}
                viewBox={`0 0 ${OUTLINE_BOX} ${OUTLINE_BOX}`}
                aria-hidden="true"
            >
                <Show when={outline}>
                    {path => (
                        <>
                            <path
                                d={path()}
                                fill="none"
                                stroke="currentColor"
                                stroke-width="7"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                opacity="0.22"
                                vector-effect="non-scaling-stroke"
                            />
                            <path
                                d={path()}
                                fill="none"
                                stroke="currentColor"
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                vector-effect="non-scaling-stroke"
                            />
                        </>
                    )}
                </Show>
            </svg>
            <p
                class={cn(
                    "font-mono text-[15px] leading-none font-semibold tracking-tight",
                    best() === null ? "text-muted" : "text-gain"
                )}
            >
                {bestText(best())}
            </p>
        </li>
    )
}

const EMPTY_LAP = "00:00.000"

const bestText = (timeMs: number | null): string =>
    timeMs === null ? EMPTY_LAP : fmt.lap(timeMs)

const attemptWord = (count: number): string => {
    if (locale() === "en") {
        return count === 1
            ? t("app.trackBoardAttemptOne")
            : t("app.trackBoardAttemptMany")
    }
    const mod10 = count % 10
    const mod100 = count % 100
    if (mod10 === 1 && mod100 !== 11) return t("app.trackBoardAttemptOne")
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return t("app.trackBoardAttemptFew")
    }
    return t("app.trackBoardAttemptMany")
}

const sortLabel = (sort: TrackSort): string => {
    switch (sort) {
        case "recent":
            return t("app.trackBoardSortRecent")
        case "popular":
            return t("app.trackBoardSortPopular")
        case "name":
            return t("app.trackBoardSortName")
    }
}

const outlines = new Map<string, string | undefined>()

const outlinePath = (track: string): string | undefined => {
    if (outlines.has(track)) return outlines.get(track)
    const path = buildOutline(track)
    outlines.set(track, path)
    return path
}

const buildOutline = (track: string): string | undefined => {
    const center = boundariesFor(track)?.center
    if (!center || center.length < 3) return undefined
    const step = Math.max(1, Math.ceil(center.length / OUTLINE_POINTS))
    const sampled = center.filter((_, index) => index % step === 0)
    const [points] = fitFrame(
        [
            {
                x: sampled.map(point => point.x),
                z: sampled.map(point => point.y),
            },
        ],
        OUTLINE_BOX,
        OUTLINE_BOX,
        OUTLINE_PADDING
    )
    if (!points || points.length < 3) return undefined
    const [first, ...rest] = points
    return `M${coordinate(first.x)} ${coordinate(first.y)}${rest
        .map(point => `L${coordinate(point.x)} ${coordinate(point.y)}`)
        .join("")}Z`
}

const coordinate = (value: number): string => value.toFixed(1)
