import {
    TabContent,
    TabIndicator,
    TabList,
    TabTrigger,
    TabsRoot,
    type TabContentProps,
    type TabIndicatorProps,
    type TabListProps,
    type TabTriggerProps,
    type TabsRootProps,
} from "@ark-ui/solid/tabs"
import { cva } from "class-variance-authority"
import { splitProps } from "solid-js"
import { cn } from "~/ui/cn"

const rootVariants = cva("flex flex-col")
const listVariants = cva(
    "relative inline-flex items-center gap-0.5 rounded border border-line bg-inset p-0.5 data-[orientation=vertical]:flex-col"
)
const triggerVariants = cva([
    "inline-flex h-7 cursor-pointer items-center justify-center rounded border border-transparent px-2",
    "text-[12px] font-medium tracking-wide text-secondary uppercase",
    "transition-colors",
    "outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20",
    "disabled:pointer-events-none disabled:opacity-40",
    "data-selected:border-line data-selected:bg-surface data-selected:text-accent",
])
const indicatorVariants = cva(
    "pointer-events-none bottom-0.5 h-px bg-accent w-(--width)"
)
const contentVariants = cva("outline-none")

export function TabsRootView(props: TabsRootProps) {
    const [local, rest] = splitProps(props, ["class"])
    return <TabsRoot class={cn(rootVariants(), local.class)} {...rest} />
}

export function TabsList(props: TabListProps) {
    const [local, rest] = splitProps(props, ["class"])
    return <TabList class={cn(listVariants(), local.class)} {...rest} />
}

export function TabsTrigger(props: TabTriggerProps) {
    const [local, rest] = splitProps(props, ["class"])
    return <TabTrigger class={cn(triggerVariants(), local.class)} {...rest} />
}

export function TabsIndicator(props: TabIndicatorProps) {
    const [local, rest] = splitProps(props, ["class"])
    return (
        <TabIndicator class={cn(indicatorVariants(), local.class)} {...rest} />
    )
}

export function TabsContent(props: TabContentProps) {
    const [local, rest] = splitProps(props, ["class"])
    return <TabContent class={cn(contentVariants(), local.class)} {...rest} />
}

export const Tabs = {
    Root: TabsRootView,
    List: TabsList,
    Trigger: TabsTrigger,
    Indicator: TabsIndicator,
    Content: TabsContent,
}
