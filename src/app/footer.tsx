import { openUrl } from "@tauri-apps/plugin-opener"
import { Show } from "solid-js"
import { accLink } from "~/app/status"
import { t } from "~/i18n"
import { buttonVariants, cn } from "~/ui"

const REPO_URL = "https://github.com/indraine/Runsheet"

export function Footer() {
    const hz = () => accLink().hz
    const packetId = () => accLink().packetId
    const hasHz = () => hz() != null
    const hasPacket = () => packetId() != null

    return (
        <footer class="sticky bottom-0 z-20 flex h-9 shrink-0 items-center gap-3 border-t border-line bg-surface px-6 font-mono text-[11px] text-muted select-none">
            <Show when={hasHz()}>
                <span>
                    {t("app.frequency")}{" "}
                    <span class="text-secondary">
                        {hz()} {t("app.hz")}
                    </span>
                </span>
            </Show>
            <Show when={hasHz() && hasPacket()}>
                <span aria-hidden="true">·</span>
            </Show>
            <Show when={hasPacket()}>
                <span>
                    {t("app.packet")}{" "}
                    <span class="text-secondary">#{packetId()}</span>
                </span>
            </Show>
            <button
                type="button"
                class={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                    "ml-auto size-7"
                )}
                aria-label={t("app.github")}
                onClick={openRepo}
            >
                <GithubMark class="size-4" />
            </button>
        </footer>
    )
}

const openRepo = (): void => {
    void openUrl(REPO_URL).catch(() => {
        window.open(REPO_URL, "_blank", "noopener,noreferrer")
    })
}

/** Lucide больше не отдаёт бренд-иконки — свой силуэт mark. */
const GithubMark = (props: { class?: string }) => (
    <svg
        class={props.class}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        <path d="M12 2C6.477 2 2 6.584 2 12.253c0 4.526 2.865 8.363 6.839 9.712.5.094.682-.222.682-.482 0-.237-.009-.866-.013-1.7-2.782.619-3.37-1.37-3.37-1.37-.454-1.18-1.11-1.494-1.11-1.494-.908-.636.069-.623.069-.623 1.003.072 1.532 1.057 1.532 1.057.892 1.566 2.341 1.114 2.91.852.092-.662.35-1.114.636-1.37-2.22-.259-4.555-1.14-4.555-5.073 0-1.12.39-2.037 1.03-2.756-.103-.26-.447-1.302.098-2.714 0 0 .84-.274 2.75 1.053A9.35 9.35 0 0 1 12 7.086c.85.004 1.705.117 2.504.343 1.909-1.327 2.748-1.053 2.748-1.053.546 1.412.202 2.454.1 2.714.64.719 1.028 1.636 1.028 2.756 0 3.943-2.339 4.811-4.566 5.065.359.317.678.943.678 1.901 0 1.37-.012 2.476-.012 2.812 0 .263.18.58.688.481A10.04 10.04 0 0 0 22 12.253C22 6.584 17.523 2 12 2Z" />
    </svg>
)
