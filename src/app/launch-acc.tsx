import { invoke, isTauri } from "@tauri-apps/api/core"
import { createEffect, createSignal, onMount, Show } from "solid-js"
import { readLaunchChoice, writeLaunchChoice } from "~/app/launch-choice"
import { accLink } from "~/app/status"
import { t } from "~/i18n"
import { Button } from "~/ui"

export const LaunchAcc = () => {
    const [install, setInstall] = createSignal<string | null>(null)
    const [remember, setRemember] = createSignal(false)
    const [dismissed, setDismissed] = createSignal(false)
    const [started, setStarted] = createSignal(false)

    onMount(() => {
        if (!isTauri()) return
        void invoke<CommandBody<string | null>>("acc_install")
            .then(unwrap)
            .then(path => setInstall(path ?? null))
            .catch(report)
    })

    createEffect(() => {
        if (started() || readLaunchChoice() !== "yes") return
        if (accLink().presence !== "off" || !install()) return
        setStarted(true)
        void invoke<CommandBody<null>>("launch_acc").then(unwrap).catch(report)
    })

    const open = () =>
        !dismissed() &&
        !started() &&
        readLaunchChoice() === undefined &&
        accLink().presence === "off" &&
        install() !== null

    const launch = () => {
        if (remember()) writeLaunchChoice("yes")
        setDismissed(true)
        setStarted(true)
        void invoke<CommandBody<null>>("launch_acc").then(unwrap).catch(report)
    }

    const later = () => {
        if (remember()) writeLaunchChoice("no")
        setDismissed(true)
    }

    return (
        <Show when={open()}>
            <div class="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 px-6">
                <div
                    class="w-full max-w-md rounded border border-line bg-surface p-6 text-ink shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="launch-acc-title"
                >
                    <h2
                        id="launch-acc-title"
                        class="font-mono text-sm font-medium tracking-wide text-ink uppercase"
                    >
                        {t("app.launchTitle")}
                    </h2>
                    <p class="mt-3 font-mono text-sm leading-5 text-secondary">
                        {t("app.launchBody")}
                    </p>
                    <label class="mt-4 flex items-center gap-2 font-mono text-xs text-secondary">
                        <input
                            type="checkbox"
                            class="size-3.5 accent-accent"
                            checked={remember()}
                            onChange={event =>
                                setRemember(event.currentTarget.checked)
                            }
                        />
                        {t("app.launchRemember")}
                    </label>
                    <div class="mt-5 flex justify-end gap-2">
                        <Button variant="secondary" onClick={later}>
                            {t("app.launchLater")}
                        </Button>
                        <Button onClick={launch}>{t("app.launchNow")}</Button>
                    </div>
                </div>
            </div>
        </Show>
    )
}

type CommandBody<T> =
    | { status: "success"; data: T }
    | { status: "error"; message: string; hint: string }

function unwrap<T>(body: CommandBody<T>): T {
    if (body.status === "success") return body.data
    throw new Error(body.message)
}

const report = (error: unknown): void => {
    console.error(error)
}
