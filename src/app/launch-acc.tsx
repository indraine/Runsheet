import { invoke, isTauri } from "@tauri-apps/api/core"
import { createEffect, createSignal, onMount, Show } from "solid-js"
import { readLaunchChoice, writeLaunchChoice } from "~/app/launch-choice"
import { accLink } from "~/app/status"
import { t } from "~/i18n"
import { Button } from "~/ui"

type CommandBody<T> =
    | { status: "success"; data: T }
    | { status: "error"; message: string; hint: string }

const [install, setInstall] = createSignal<string | null>(null)
const [launching, setLaunching] = createSignal(false)

export const isGameOff = () => accLink().presence === "off"

/** Запускает ACC один раз, пока игра не появилась в статусе. */
const launchAcc = (): void => {
    if (launching()) return
    setLaunching(true)
    void invoke<CommandBody<null>>("launch_acc")
        .then(unwrap)
        .catch(error => {
            setLaunching(false)
            report(error)
        })
}

/** Спрашивает при каждом старте Runsheet, пока выбор не запомнен. */
export const LaunchAcc = () => {
    const [remember, setRemember] = createSignal(false)
    const [answered, setAnswered] = createSignal(false)

    createEffect(() => {
        if (!isGameOff()) setLaunching(false)
    })

    onMount(() => {
        if (!isTauri()) return
        void invoke<CommandBody<string | null>>("acc_install")
            .then(unwrap)
            .then(path => setInstall(path ?? null))
            .catch(report)
    })

    createEffect(() => {
        if (answered() || readLaunchChoice() !== "yes") return
        if (!isGameOff() || !install()) return
        setAnswered(true)
        launchAcc()
    })

    const open = () =>
        !answered() &&
        readLaunchChoice() === undefined &&
        isGameOff() &&
        install() !== null

    const answer = (launch: boolean) => {
        if (remember()) writeLaunchChoice(launch ? "yes" : "no")
        setAnswered(true)
        if (launch) launchAcc()
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
                        <Button
                            variant="secondary"
                            onClick={() => answer(false)}
                        >
                            {t("app.launchLater")}
                        </Button>
                        <Button onClick={() => answer(true)}>
                            {t("app.launchNow")}
                        </Button>
                    </div>
                </div>
            </div>
        </Show>
    )
}

/** Кнопка в шапке вместо статуса, пока игра не запущена. */
export const LaunchAccButton = () => (
    <Button
        size="sm"
        disabled={install() === null || launching()}
        title={install() === null ? t("app.launchMissing") : undefined}
        onClick={launchAcc}
    >
        {launching() ? t("app.launchStarting") : t("app.launchButton")}
    </Button>
)

function unwrap<T>(body: CommandBody<T>): T {
    if (body.status === "success") return body.data
    throw new Error(body.message)
}

const report = (error: unknown): void => {
    console.error(error)
}
