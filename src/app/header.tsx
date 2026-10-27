import { A, useMatch } from "@solidjs/router"
import { createEffect, onCleanup, onMount, Show, untrack } from "solid-js"
import { GithubLink } from "~/app/github-link"
import { LaunchAccButton } from "~/app/launch-acc"
import { SettingsMenu } from "~/app/settings-menu"
import {
    accPresence,
    analysisHeading,
    paintAccPresence,
    type AccPresence,
} from "~/app/status"
import { LocaleToggle } from "~/app/locale-toggle"
import { ThemeToggle } from "~/app/theme-toggle"
import { Wordmark } from "~/app/wordmark"
import { t } from "~/i18n"
import { locale } from "~/i18n/locale"
import { buttonVariants, cn } from "~/ui"

export function Header() {
    const analysis = useMatch(() => "/telemetry")

    return (
        <header class="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6">
            <div class="flex min-w-0 items-center gap-4">
                <A
                    href="/"
                    class="inline-flex h-10 shrink-0 items-center rounded leading-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20"
                >
                    <Wordmark class="h-10" />
                </A>
                <span class="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
                <Show when={analysis()}>
                    <span class="min-w-0 truncate font-mono text-lg font-medium tracking-wide text-ink uppercase">
                        {analysisHeading().track ?? t("app.empty")}
                    </span>
                    <span class="min-w-0 truncate font-mono text-lg text-secondary">
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
                <Show when={!analysis()}>
                    <A
                        href="/telemetry"
                        class={buttonVariants({
                            variant: "secondary",
                            size: "sm",
                        })}
                    >
                        {t("app.analyzeSession")}
                    </A>
                </Show>
                <GithubLink />
                <LocaleToggle />
                <ThemeToggle />
                <SettingsMenu />
            </div>
        </header>
    )
}

function AccStatus() {
    let row: HTMLParagraphElement | undefined
    let label: HTMLSpanElement | undefined
    let launch: HTMLSpanElement | undefined

    const paint = (value: AccPresence) => {
        const name = presenceName(value)
        if (label) label.textContent = name
        if (row) {
            row.hidden = name === ""
            row.className = cn(presenceBubble, presenceTone(value))
        }
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
            <p ref={row} hidden class={presenceBubble}>
                <span ref={label} />
            </p>
        </>
    )
}

const presenceBubble =
    "inline-flex h-6 shrink-0 items-center self-center rounded-full border border-current/30 px-2.5 font-mono text-[11px] leading-none font-semibold tracking-wide whitespace-nowrap uppercase"

const presenceTone = (value: AccPresence): string => {
    if (value === "onTrack") return "bg-gain/15 text-gain"
    if (value === "inPits") return "bg-accent/15 text-accent"
    if (value === "menu") return "bg-caution/15 text-caution"
    return "bg-inset text-secondary"
}

const presenceName = (value: AccPresence): string => {
    if (value === "onTrack") return t("app.accOnTrack")
    if (value === "inPits") return t("app.accInPits")
    if (value === "menu") return t("app.accMenu")
    return ""
}
