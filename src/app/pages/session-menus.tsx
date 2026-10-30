import { Menu } from "@ark-ui/solid/menu"
import {
    Check,
    Columns3,
    GitCompareArrows,
    Map as MapIcon,
    Radio,
} from "lucide-solid"
import { For, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { screenPopupClass, screenPositioning } from "~/app/screen-position"
import {
    SESSION_COLUMNS,
    resetSessionColumns,
    sessionColumns,
    setSessionColumnShown,
    type SessionColumn,
} from "~/app/session-columns"
import { t } from "~/i18n"
import { buttonVariants, cn } from "~/ui"

/** Attribute a table row carries so the context menu can find its session. */
const SESSION_ROW_ATTR = "data-session-id"

const contentClass =
    "z-50 min-w-44 rounded border border-line bg-surface p-1 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)] outline-none"

const itemClass =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink data-disabled:cursor-default data-disabled:opacity-40"

const iconProps = { class: "size-4", strokeWidth: 1.75 } as const

/** Button above the table: which columns the table shows. */
export function ColumnsMenu(props: {
    label: (column: SessionColumn) => string
}) {
    const onlyOne = () => sessionColumns().length <= 1

    return (
        <Menu.Root
            aria-label={t("app.sessionColumns")}
            closeOnSelect={false}
            positioning={screenPositioning({ placement: "bottom-end" })}
            onSelect={details => {
                if (details.value === "all") resetSessionColumns()
            }}
        >
            <Menu.Trigger
                class={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "h-[34px]"
                )}
            >
                <Columns3 {...iconProps} />
                {t("app.sessionColumns")}
            </Menu.Trigger>
            <Portal>
                <Menu.Positioner class={screenPopupClass}>
                    <Menu.Content class={contentClass}>
                        <For each={SESSION_COLUMNS}>
                            {column => {
                                const shown = () =>
                                    sessionColumns().includes(column)
                                return (
                                    <Menu.CheckboxItem
                                        value={column}
                                        class={itemClass}
                                        checked={shown()}
                                        disabled={shown() && onlyOne()}
                                        onCheckedChange={checked =>
                                            setSessionColumnShown(
                                                column,
                                                checked
                                            )
                                        }
                                    >
                                        <span class="size-4 shrink-0">
                                            <Menu.ItemIndicator>
                                                <Check {...iconProps} />
                                            </Menu.ItemIndicator>
                                        </span>
                                        <span class="flex-1 text-left">
                                            {props.label(column)}
                                        </span>
                                    </Menu.CheckboxItem>
                                )
                            }}
                        </For>
                        <Menu.Separator class="my-1 border-t border-line" />
                        <Menu.Item value="all" class={itemClass}>
                            <span class="size-4 shrink-0" aria-hidden="true" />
                            <span class="flex-1 text-left">
                                {t("app.sessionColumnsAll")}
                            </span>
                        </Menu.Item>
                    </Menu.Content>
                </Menu.Positioner>
            </Portal>
        </Menu.Root>
    )
}

/**
 * Right-click menu for the rows inside `children`.
 *
 * The click is read in the capture phase, before Ark sees it. A row (an
 * element with `data-session-id`) is reported through `onTarget` and the menu
 * opens. Anywhere else the click is swallowed and no menu opens.
 */
export function SessionContextMenu(props: {
    class?: string
    /** The row the menu opened on shows its live card right now. */
    opened: boolean
    onTarget: (sessionId: string) => void
    onCompare: () => void
    onToggleLive: () => void
    children: JSX.Element
}) {
    const pick = (event: MouseEvent) => {
        const target = event.target
        const row =
            target instanceof Element
                ? target.closest(`[${SESSION_ROW_ATTR}]`)
                : null
        const id = row?.getAttribute(SESSION_ROW_ATTR)
        if (!id) {
            event.preventDefault()
            event.stopImmediatePropagation()
            return
        }
        props.onTarget(id)
    }

    return (
        <Menu.Root
            aria-label={t("app.sessionActions")}
            positioning={screenPositioning({
                placement: "bottom-start",
                gutter: 2,
            })}
            onSelect={details => {
                if (details.value === "compare") props.onCompare()
                if (details.value === "live") props.onToggleLive()
            }}
        >
            <Menu.ContextTrigger
                asChild={trigger => (
                    <div
                        {...trigger()}
                        class={props.class}
                        on:contextmenu={{
                            handleEvent: pick,
                            capture: true,
                        }}
                    />
                )}
            >
                {props.children}
            </Menu.ContextTrigger>
            <Portal>
                <Menu.Positioner class={screenPopupClass}>
                    <Menu.Content class={contentClass}>
                        <Menu.Item value="compare" class={itemClass}>
                            <GitCompareArrows {...iconProps} />
                            <span class="flex-1 text-left">
                                {t("app.compare")}
                            </span>
                        </Menu.Item>
                        <Menu.Item value="live" class={itemClass}>
                            <Show
                                when={props.opened}
                                fallback={<Radio {...iconProps} />}
                            >
                                <MapIcon {...iconProps} />
                            </Show>
                            <span class="flex-1 text-left">
                                {props.opened
                                    ? t("app.showTracks")
                                    : t("app.showLiveCard")}
                            </span>
                        </Menu.Item>
                    </Menu.Content>
                </Menu.Positioner>
            </Portal>
        </Menu.Root>
    )
}
