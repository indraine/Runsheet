import { createMemo, For, Show } from "solid-js"
import { setTrackBoardSort, trackBoardSort } from "~/app/track-board-sort"
import { fitFrame } from "~/app/fit-ground"
import { boundariesFor } from "~/app/track-catalog"
import {
    sortTracks,
    TRACK_SORTS,
    type TrackRecord,
    type TrackSort,
} from "~/domain"
import { fmt, t, trackCodes, trackName } from "~/i18n"
import { PaneToggle } from "~/app/pages/home-split"
import { AdaptiveTabs } from "~/app/adaptive-tabs"
import { locale } from "~/i18n/locale"
import { cn } from "~/ui"

const OUTLINE_BOX = 100

const OUTLINE_PADDING = 4

const OUTLINE_POINTS = 360

export const TrackBoard = (props: {
    records: ReadonlyMap<string, TrackRecord>
}) => {
    const ordered = createMemo(() =>
        sortTracks(trackCodes, props.records, trackBoardSort())
    )
    return (
        <section class="@container flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-line bg-surface">
            <header class="flex shrink-0 items-center gap-x-3 border-b border-line px-4 py-3">
                <h2 class="min-w-0 truncate text-lg font-semibold tracking-tight text-ink uppercase">
                    {t("app.trackBoard")}
                </h2>
                <div class="ml-auto flex shrink-0 items-center gap-2">
                    <AdaptiveTabs
                        from="lg"
                        items={TRACK_SORTS}
                        value={trackBoardSort()}
                        onChange={setTrackBoardSort}
                        label={sortLabel}
                        ariaLabel={t("app.trackBoardSort")}
                    />
                    <PaneToggle pane="right" />
                </div>
            </header>
            <ul class="grid min-h-0 flex-1 grid-cols-2 content-start @3xl:grid-cols-3 @5xl:grid-cols-4 overflow-y-auto overscroll-contain [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                <For each={ordered()}>
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

const TrackTile = (props: {
    track: string
    record: TrackRecord | undefined
}) => {
    const outline = outlinePath(props.track)
    const best = () => props.record?.bestLap?.timeMs ?? null
    const driven = () => props.record !== undefined

    return (
        <li class="flex aspect-[4/3] min-w-0 flex-col gap-1 border-r border-b border-line px-4 pt-3 pb-4 nth-[2n]:border-r-0 @3xl:nth-[2n]:border-r @3xl:nth-[3n]:border-r-0 @5xl:nth-[3n]:border-r @5xl:nth-[4n]:border-r-0">
            <div class="flex items-start justify-between gap-3">
                <p class="min-w-0 truncate text-lg leading-none font-semibold tracking-tight text-ink uppercase italic select-text">
                    {trackName(props.track)}
                </p>
                <Show when={props.record}>
                    {record => (
                        <p class="shrink-0 text-right leading-none">
                            <span class="block font-mono text-[15px] leading-none font-semibold tracking-tight text-ink">
                                {record().sessions}
                            </span>
                            <span class="mt-0.5 block text-[12px] leading-none font-medium tracking-wide text-secondary uppercase">
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
