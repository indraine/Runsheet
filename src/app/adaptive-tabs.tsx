import { Select, createListCollection } from "@ark-ui/solid/select"
import { Check, ChevronDown } from "lucide-solid"
import { For, createMemo } from "solid-js"
import { Portal } from "solid-js/web"
import {
    screenMenuListClass,
    screenPopupClass,
    screenPositioning,
} from "~/app/screen-position"
import { Tabs, cn } from "~/ui"

/**
 * Width of the nearest `@container` from which the tabs are shown. Narrower
 * than that a select takes their place. The class names are written out so
 * Tailwind can find them.
 */
const SWITCH = {
    md: { tabs: "hidden @md:block", select: "@md:hidden" },
    lg: { tabs: "hidden @lg:block", select: "@lg:hidden" },
    xl: { tabs: "hidden @xl:block", select: "@xl:hidden" },
    "2xl": { tabs: "hidden @2xl:block", select: "@2xl:hidden" },
    "3xl": { tabs: "hidden @3xl:block", select: "@3xl:hidden" },
} as const

export type TabsBreakpoint = keyof typeof SWITCH

const itemClass =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink data-[state=checked]:text-accent"

/**
 * Tabs that fold into a select when their container is too narrow.
 * The parent must be an `@container`.
 */
export function AdaptiveTabs<T extends string>(props: {
    items: readonly T[]
    value: T
    onChange: (value: T) => void
    label: (item: T) => string
    ariaLabel: string
    from: TabsBreakpoint
}) {
    const pick = (value: string | undefined): T | undefined =>
        props.items.find(item => item === value)
    const collection = createMemo(() =>
        createListCollection<T>({
            items: [...props.items],
            itemToValue: item => item,
            itemToString: item => props.label(item),
        })
    )

    return (
        <>
            <div class={SWITCH[props.from].tabs}>
                <Tabs.Root
                    value={props.value}
                    onValueChange={details => {
                        const next = pick(details.value)
                        if (next) props.onChange(next)
                    }}
                >
                    <Tabs.List aria-label={props.ariaLabel}>
                        <For each={props.items}>
                            {item => (
                                <Tabs.Trigger value={item}>
                                    {props.label(item)}
                                </Tabs.Trigger>
                            )}
                        </For>
                    </Tabs.List>
                </Tabs.Root>
            </div>
            <div class={cn("min-w-0", SWITCH[props.from].select)}>
                <Select.Root
                    collection={collection()}
                    value={[props.value]}
                    positioning={screenPositioning({
                        placement: "bottom-end",
                        gutter: 4,
                    })}
                    onValueChange={details => {
                        const next = pick(details.value[0])
                        if (next) props.onChange(next)
                    }}
                >
                    <Select.Control>
                        <Select.Trigger
                            aria-label={props.ariaLabel}
                            class="inline-flex h-[34px] max-w-40 cursor-pointer items-center gap-1.5 rounded border border-line bg-inset px-2.5 text-[12px] font-medium tracking-wide text-ink uppercase outline-none hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20"
                        >
                            <Select.ValueText class="truncate" />
                            <ChevronDown
                                class="size-3.5 shrink-0 text-secondary"
                                strokeWidth={1.75}
                            />
                        </Select.Trigger>
                    </Select.Control>
                    <Portal>
                        <Select.Positioner class={screenPopupClass}>
                            <Select.Content
                                class={cn(
                                    screenMenuListClass,
                                    "min-w-36 rounded border border-line bg-surface p-1 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)] outline-none"
                                )}
                            >
                                <For each={props.items}>
                                    {item => (
                                        <Select.Item
                                            item={item}
                                            class={itemClass}
                                        >
                                            <Select.ItemText class="flex-1 text-left">
                                                {props.label(item)}
                                            </Select.ItemText>
                                            <Select.ItemIndicator class="flex size-3.5 items-center justify-center">
                                                <Check
                                                    class="size-3.5"
                                                    strokeWidth={1.75}
                                                />
                                            </Select.ItemIndicator>
                                        </Select.Item>
                                    )}
                                </For>
                            </Select.Content>
                        </Select.Positioner>
                    </Portal>
                </Select.Root>
            </div>
        </>
    )
}
