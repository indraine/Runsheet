import { A, useMatch } from "@solidjs/router"
import { ArrowLeft } from "lucide-solid"
import { createEffect, onCleanup, onMount, Show, untrack } from "solid-js"
import { LaunchAccButton } from "~/app/launch-acc"
import { SettingsMenu } from "~/app/settings-menu"
import {
    accPresence,
    analysisHeading,
    paintAccPresence,
    type AccPresence,
} from "~/app/status"
import { ThemeToggle } from "~/app/theme-toggle"
import { Wordmark } from "~/app/wordmark"
import { t } from "~/i18n"
import { locale } from "~/i18n/locale"
import { cn } from "~/ui"

export function Header() {
    const analysis = useMatch(() => "/sessions/:sessionId/laps/:lapId")

    return (
        <header class="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6">
            <div class="flex min-w-0 items-center gap-4">
                <A
                    href="/"
                    class="shrink-0 rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20"
                >
                    <Wordmark class="h-10" />
                </A>
                <span class="h-4 w-px shrink-0 bg-line" aria-hidden="true" />
                <Show when={analysis()}>
                    <A
                        href="/"
                        class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 font-mono text-[11px] font-medium tracking-wide text-secondary uppercase hover:bg-inset hover:text-ink"
                    >
                        <ArrowLeft class="size-3.5" strokeWidth={1.75} />
                        {t("app.backToTimeline")}
                    </A>
                    <span class="text-[11px] text-muted" aria-hidden="true">
                        ·
                    </span>
                    <span class="truncate font-mono text-[11px] font-medium tracking-wide text-ink uppercase">
                        {analysisHeading().track ?? t("app.empty")}
                    </span>
                    <span class="truncate font-mono text-[11px] text-secondary">
                        {analysisHeading().car ?? t("app.empty")}
                    </span>
                </Show>
                <Show when={!analysis()}>
                    <AccStatus />
                </Show>
            </div>
            <div class="flex shrink-0 items-center gap-3">
                <Show when={analysis()}>
                    <AccStatus />
                </Show>
                <ThemeToggle />
                <SettingsMenu />
            </div>
        </header>
    )
}

function AccStatus() {
    let row: HTMLParagraphElement | undefined
    let dot: HTMLSpanElement | undefined
    let label: HTMLSpanElement | undefined
    let launch: HTMLSpanElement | undefined

    const paint = (value: AccPresence) => {
        const name = presenceName(value)
        if (label) label.textContent = name
        if (dot) {
            dot.className = cn(
                "size-1.5 rounded-full",
                value === "onTrack"
                    ? "bg-gain"
                    : value === "inPits"
                      ? "bg-accent"
                      : "bg-muted"
            )
        }
        if (row) row.hidden = name === ""
        if (launch) launch.hidden = value !== "off"
    }

    onMount(() => {
        onCleanup(paintAccPresence(paint))
        createEffect(() => {
            locale()
            untrack(() => paint(accPresence()))
        })
    })

    return (
        <>
            <span ref={launch} hidden>
                <LaunchAccButton />
            </span>
            <p
                ref={row}
                hidden
                class="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] font-medium tracking-wide text-secondary uppercase"
            >
                <span ref={dot} class="size-1.5 rounded-full bg-muted" aria-hidden="true" />
                <span ref={label} />
            </p>
        </>
    )
}

const presenceName = (value: AccPresence): string => {
    if (value === "onTrack") return t("app.accOnTrack")
    if (value === "inPits") return t("app.accInPits")
    if (value === "menu") return t("app.accMenu")
    return ""
}
