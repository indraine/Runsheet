import { Menu } from "@ark-ui/solid/menu"
import {
    Download,
    Minus,
    Plus,
    RotateCcw,
    Settings,
    Upload,
} from "lucide-solid"
import { downloadDump, parseDumpFile, useSessionRepository } from "~/db"
import { UI_SCALES, uiScale, zoomBy } from "~/app/scale"
import { resetSettings } from "~/app/stored"
import { t } from "~/i18n"
import { buttonVariants, cn } from "~/ui"

const itemClass =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink"


export function SettingsMenu() {
    const repository = useSessionRepository()
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
                        <ScaleControl />
                        <Menu.Separator class="my-1 border-t border-line" />
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
                    </Menu.Content>
                </Menu.Positioner>
            </Menu.Root>
        </>
    )
}

const scaleButtonClass = cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    "size-6"
)

const keepMenuOpen = (event: MouseEvent) => {
    event.preventDefault()
}

const ScaleControl = () => (
    <div class="flex items-center gap-1 px-2 py-1">
        <span class="mr-auto font-mono text-[11px] text-secondary">
            {t("app.scale")}
        </span>
        <button
            type="button"
            class={scaleButtonClass}
            aria-label={t("app.scaleDown")}
            disabled={uiScale() === UI_SCALES[0]}
            onMouseDown={keepMenuOpen}
            onClick={() => zoomBy(-1)}
        >
            <Minus class="size-3.5" strokeWidth={1.75} />
        </button>
        <span
            class="w-10 text-center font-mono text-[11px] text-ink"
            aria-live="polite"
        >
            {uiScale()}%
        </span>
        <button
            type="button"
            class={scaleButtonClass}
            aria-label={t("app.scaleUp")}
            disabled={uiScale() === UI_SCALES[UI_SCALES.length - 1]}
            onMouseDown={keepMenuOpen}
            onClick={() => zoomBy(1)}
        >
            <Plus class="size-3.5" strokeWidth={1.75} />
        </button>
    </div>
)
