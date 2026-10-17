import { A, useMatch } from "@solidjs/router"
import { ArrowLeft } from "lucide-solid"
import { Show } from "solid-js"
import wordmark from "~/assets/wordmark.svg"
import { accLink, analysisHeading } from "~/app/status"
import { t } from "~/i18n"

export function Header() {
    const analysis = useMatch(() => "/sessions/:sessionId/laps/:lapId")

    return (
        <header class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6">
            <div class="flex min-w-0 items-center gap-4">
                <A
                    href="/"
                    class="shrink-0 rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20"
                >
                    <img
                        src={wordmark}
                        alt={t("app.wordmark")}
                        class="h-10 w-auto"
                    />
                </A>
                <span class="h-4 w-px shrink-0 bg-line" aria-hidden="true" />
                <Show when={analysis()} fallback={<AccStatus />}>
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
            </div>
            <Show when={analysis()}>
                <AccStatus />
            </Show>
        </header>
    )
}

function AccStatus() {
    return (
        <p class="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] font-medium tracking-wide text-secondary uppercase">
            <span class="size-1.5 rounded-full bg-muted" aria-hidden="true" />
            <Show when={!accLink().linked}>{t("app.accOffline")}</Show>
        </p>
    )
}
