import { Tooltip } from "@ark-ui/solid/tooltip"
import { CircleQuestionMark } from "lucide-solid"
import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { formatFileSize } from "~/app/export-size"
import {
    screenPopupOverModalClass,
    screenPositioning,
} from "~/app/screen-position"
import {
    buildExport,
    saveExport,
    type ExportFile,
    type ExportFormat,
    type SessionRepository,
} from "~/db"
import { t } from "~/i18n"
import { locale } from "~/i18n/locale"
import { Button, cn } from "~/ui"

type Choice = ExportFormat | "motec"

type Option = {
    value: Choice
    label: () => string
    help: () => string
    soon?: boolean
}

const OPTIONS: readonly Option[] = [
    {
        value: "json",
        label: () => t("app.exportJson"),
        help: () => t("app.exportJsonHelp"),
    },
    {
        value: "binary",
        label: () => t("app.exportBinary"),
        help: () => t("app.exportBinaryHelp"),
    },
    {
        value: "motec",
        label: () => t("app.exportMotec"),
        help: () => t("app.exportMotecHelp"),
        soon: true,
    },
]

/**
 * Format choice for the export: JSON, the compact binary file, MoTeC (soon).
 *
 * The files are built when the dialog opens, so the size on each row is the
 * real size of the file that will be saved, not an estimate.
 */
export function ExportDialog(props: {
    repository: SessionRepository
    onClose: () => void
    onError: (error: unknown) => void
}) {
    const [choice, setChoice] = createSignal<Choice>("binary")
    const [files, setFiles] = createSignal<
        Partial<Record<ExportFormat, ExportFile>>
    >({})
    const [failed, setFailed] = createSignal(false)
    const [saving, setSaving] = createSignal(false)

    const units = () => ({
        b: t("app.unitByte"),
        kb: t("app.unitKb"),
        mb: t("app.unitMb"),
    })

    const sizeOf = (value: Choice): string => {
        if (value === "motec") return t("app.empty")
        const file = files()[value]
        if (file) return formatFileSize(file.bytes.length, units(), locale())
        return failed()
            ? t("app.exportSizeUnknown")
            : t("app.exportSizeCounting")
    }

    const close = () => {
        if (saving()) return
        props.onClose()
    }

    const save = async () => {
        const picked = choice()
        if (picked === "motec") return
        const file = files()[picked]
        if (!file || saving()) return
        setSaving(true)
        try {
            if (await saveExport(file)) props.onClose()
        } catch (error) {
            props.onError(error)
        } finally {
            setSaving(false)
        }
    }

    onMount(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") close()
        }
        document.addEventListener("keydown", onKey)
        onCleanup(() => document.removeEventListener("keydown", onKey))

        void (async () => {
            try {
                const dump = await props.repository.exportAll()
                const json = await buildExport(dump, "json")
                setFiles({ json })
                setFiles({ json, binary: await buildExport(dump, "binary") })
            } catch (error) {
                setFailed(true)
                props.onError(error)
            }
        })()
    })

    const ready = () => {
        const picked = choice()
        return picked !== "motec" && files()[picked] !== undefined
    }

    return (
        <div
            class="fixed-screen z-50 flex items-center justify-center bg-ink/30 px-6"
            onClick={close}
        >
            <div
                class="w-full max-w-md rounded border border-line bg-surface text-ink shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-title"
                onClick={event => event.stopPropagation()}
            >
                <div class="px-6 pt-5 pb-3">
                    <h2
                        id="export-title"
                        class="text-sm font-medium tracking-wide text-ink uppercase"
                    >
                        {t("app.exportTitle")}
                    </h2>
                    <p class="mt-1 text-[12px] text-secondary">
                        {t("app.exportFormat")}
                    </p>
                </div>
                <div
                    role="radiogroup"
                    aria-labelledby="export-title"
                    class="border-t border-line"
                >
                    <For each={OPTIONS}>
                        {option => (
                            <FormatRow
                                option={option}
                                selected={choice() === option.value}
                                size={sizeOf(option.value)}
                                onSelect={() => setChoice(option.value)}
                            />
                        )}
                    </For>
                </div>
                <div class="flex justify-end gap-2 border-t border-line px-6 py-4">
                    <Button
                        variant="secondary"
                        disabled={saving()}
                        onClick={close}
                    >
                        {t("app.exportCancel")}
                    </Button>
                    <Button disabled={!ready() || saving()} onClick={save}>
                        {t("app.exportAction")}
                    </Button>
                </div>
            </div>
        </div>
    )
}

const FormatRow = (props: {
    option: Option
    selected: boolean
    size: string
    onSelect: () => void
}): JSX.Element => (
    <div
        class={cn(
            "flex items-center gap-3 border-b border-line px-6 py-3 last:border-b-0",
            props.option.soon && "opacity-60"
        )}
    >
        <button
            type="button"
            role="radio"
            aria-checked={props.selected}
            disabled={props.option.soon}
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20 disabled:cursor-default"
            onClick={props.onSelect}
        >
            <span
                class={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    props.selected ? "border-accent" : "border-line"
                )}
                aria-hidden="true"
            >
                <Show when={props.selected}>
                    <span class="size-2 rounded-full bg-accent" />
                </Show>
            </span>
            <span class="flex-1 text-sm text-ink">{props.option.label()}</span>
            <Show
                when={props.option.soon}
                fallback={
                    <span class="font-mono text-[12px] text-secondary">
                        {props.size}
                    </span>
                }
            >
                <span class="text-[12px] tracking-wide text-muted uppercase">
                    {t("app.exportSoon")}
                </span>
            </Show>
        </button>
        <Tooltip.Root
            openDelay={120}
            closeDelay={80}
            positioning={screenPositioning({ placement: "top" })}
        >
            <Tooltip.Trigger
                type="button"
                aria-label={`${t("app.exportAbout")}: ${props.option.label()}`}
                class="inline-flex cursor-help rounded-full text-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20"
            >
                <CircleQuestionMark class="size-4" strokeWidth={1.75} />
            </Tooltip.Trigger>
            <Portal>
                <Tooltip.Positioner class={screenPopupOverModalClass}>
                    <Tooltip.Content class="max-w-xs rounded border border-line bg-surface px-3 py-2 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none">
                        <p class="text-sm leading-relaxed text-secondary">
                            {props.option.help()}
                        </p>
                    </Tooltip.Content>
                </Tooltip.Positioner>
            </Portal>
        </Tooltip.Root>
    </div>
)
