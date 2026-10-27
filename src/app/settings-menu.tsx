import { Menu } from "@ark-ui/solid/menu"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { Download, RotateCcw, Settings, Trash2, Upload } from "lucide-solid"
import { downloadDump, parseDumpFile, useSessionRepository } from "~/db"
import { resetSettings } from "~/app/stored"
import { t } from "~/i18n"
import { Button, buttonVariants } from "~/ui"

const itemClass =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink"

const dangerItemClass =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] text-loss outline-none data-highlighted:bg-loss/10 data-highlighted:text-loss"

export function SettingsMenu() {
    const repository = useSessionRepository()
    const [confirming, setConfirming] = createSignal(false)
    let fileInput!: HTMLInputElement

    const exportData = async () => {
        const repo = repository()
        if (!repo) return
        try {
            await downloadDump(await repo.exportAll())
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : String(error)
            window.alert(`${t("app.exportFailed")}\n${detail}`)
        }
    }

    const importData = async (file: File) => {
        const repo = repository()
        if (!repo) return
        try {
            await repo.importAll(await parseDumpFile(file))
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : String(error)
            window.alert(`${t("app.importFailed")}\n${detail}`)
        }
    }

    return (
        <>
            <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                class="hidden"
                onChange={event => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ""
                    if (file) void importData(file)
                }}
            />
            <Menu.Root
                aria-label={t("app.settings")}
                positioning={{ placement: "bottom-end", gutter: 8 }}
                onSelect={details => {
                    if (details.value === "reset") resetSettings()
                    if (details.value === "export") void exportData()
                    if (details.value === "import") fileInput.click()
                    if (details.value === "clear") setConfirming(true)
                }}
            >
                <Menu.Trigger
                    class={buttonVariants({ variant: "ghost", size: "icon" })}
                    aria-label={t("app.settings")}
                >
                    <Settings class="size-4" strokeWidth={1.75} />
                </Menu.Trigger>
                <Menu.Positioner>
                    <Menu.Content class="z-50 min-w-44 rounded border border-line bg-surface p-1 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]">
                        <Menu.Item value="export" class={itemClass}>
                            <Download class="size-4" strokeWidth={1.75} />
                            <span class="flex-1 text-left">
                                {t("app.exportData")}
                            </span>
                        </Menu.Item>
                        <Menu.Item value="import" class={itemClass}>
                            <Upload class="size-4" strokeWidth={1.75} />
                            <span class="flex-1 text-left">
                                {t("app.importData")}
                            </span>
                        </Menu.Item>
                        <Menu.Separator class="my-1 border-t border-line" />
                        <Menu.Item value="reset" class={itemClass}>
                            <RotateCcw class="size-4" strokeWidth={1.75} />
                            <span class="flex-1 text-left">
                                {t("app.resetSettings")}
                            </span>
                        </Menu.Item>
                        <Menu.Separator class="my-1 border-t border-line" />
                        <Menu.Item value="clear" class={dangerItemClass}>
                            <Trash2 class="size-4" strokeWidth={1.75} />
                            <span class="flex-1 text-left">
                                {t("app.clearData")}
                            </span>
                        </Menu.Item>
                    </Menu.Content>
                </Menu.Positioner>
            </Menu.Root>
            <Show when={confirming()}>
                <ClearDataDialog
                    onCancel={() => setConfirming(false)}
                    onConfirm={async () => {
                        const repo = repository()
                        if (!repo) return
                        try {
                            await repo.clearAll()
                            setConfirming(false)
                        } catch (error) {
                            const detail =
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            window.alert(
                                `${t("app.clearDataFailed")}\n${detail}`
                            )
                        }
                    }}
                />
            </Show>
        </>
    )
}

function ClearDataDialog(props: {
    onCancel: () => void
    onConfirm: () => Promise<void>
}) {
    const [clearing, setClearing] = createSignal(false)
    let cancel: HTMLButtonElement | undefined

    const dismiss = () => {
        if (clearing()) return
        props.onCancel()
    }

    const confirm = () => {
        if (clearing()) return
        setClearing(true)
        void props.onConfirm().finally(() => setClearing(false))
    }

    onMount(() => {
        cancel?.focus()
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") dismiss()
        }
        document.addEventListener("keydown", onKey)
        onCleanup(() => document.removeEventListener("keydown", onKey))
    })

    return (
        <div
            class="fixed-screen z-50 flex items-center justify-center bg-ink/30 px-6"
            onClick={dismiss}
        >
            <div
                class="w-full max-w-md rounded border border-line bg-surface p-6 text-ink shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="clear-data-title"
                aria-describedby="clear-data-body"
                onClick={event => event.stopPropagation()}
            >
                <h2
                    id="clear-data-title"
                    class="font-mono text-sm font-medium tracking-wide text-ink uppercase"
                >
                    {t("app.clearDataTitle")}
                </h2>
                <p
                    id="clear-data-body"
                    class="mt-3 font-mono text-sm leading-5 text-secondary"
                >
                    {t("app.clearDataBody")}
                </p>
                <div class="mt-5 flex justify-end gap-2">
                    <Button
                        ref={cancel}
                        variant="secondary"
                        disabled={clearing()}
                        onClick={dismiss}
                    >
                        {t("app.clearDataCancel")}
                    </Button>
                    <Button
                        variant="danger"
                        disabled={clearing()}
                        onClick={confirm}
                    >
                        {t("app.clearDataConfirm")}
                    </Button>
                </div>
            </div>
        </div>
    )
}
