import { Popover } from "@ark-ui/solid/popover"
import { Check, ChevronDown } from "lucide-solid"
import { For } from "solid-js"
import { Portal } from "solid-js/web"
import { screenPopupClass, screenPositioning } from "~/app/screen-position"
import type {
    AnalysisChannel,
    ChannelLayout,
} from "~/app/telemetry/channel-layout"
import { t } from "~/i18n"
import { cn } from "~/ui"

/** Chart title for each analysis channel. */
export const CHANNEL_LABEL = {
    speed: "app.telemetrySpeed",
    throttle: "app.telemetryThrottle",
    brake: "app.telemetryBrake",
    steer: "app.telemetrySteer",
    gear: "app.telemetryGear",
    rpm: "app.telemetryRpm",
    delta: "app.telemetryDelta",
} as const satisfies Record<AnalysisChannel, string>

/** Popover that shows or hides each chart. The caller persists the layout. */
export const ChannelDrawer = (props: {
    layout: ChannelLayout
    onToggle: (channel: AnalysisChannel) => void
}) => (
    <Popover.Root positioning={screenPositioning({ placement: "bottom-end" })}>
        <Popover.Trigger
            class={cn(
                "inline-flex h-9 cursor-pointer items-center gap-2 rounded border border-line bg-inset px-3 font-mono text-base text-secondary outline-none hover:border-secondary hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20"
            )}
            aria-label={t("app.telemetryChannels")}
        >
            <span>{t("app.telemetryChannels")}</span>
            <ChevronDown class="size-4 shrink-0" strokeWidth={2} />
        </Popover.Trigger>
        <Portal>
            <Popover.Positioner class={screenPopupClass}>
                <Popover.Content class="flex max-h-(--available-height) w-56 flex-col overflow-hidden rounded border border-line bg-surface shadow-[0_8px_28px_-8px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.12)] outline-none">
                    <div class="shrink-0 border-b border-line px-3 py-2">
                        <Popover.Title class="font-mono text-sm font-semibold tracking-wide text-secondary uppercase">
                            {t("app.telemetryChannels")}
                        </Popover.Title>
                    </div>
                    <ul class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5">
                        <For each={props.layout.order}>
                            {channel => {
                                const shown = () =>
                                    !props.layout.hidden.includes(channel)
                                return (
                                    <li>
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={shown()}
                                            class="flex w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-left font-mono text-base text-ink outline-none hover:bg-inset"
                                            onClick={() =>
                                                props.onToggle(channel)
                                            }
                                        >
                                            <span
                                                class={cn(
                                                    "grid size-4 shrink-0 place-items-center rounded-sm border",
                                                    shown()
                                                        ? "border-ink bg-ink text-surface"
                                                        : "border-line"
                                                )}
                                            >
                                                <Check
                                                    class={cn(
                                                        "size-3",
                                                        !shown() && "invisible"
                                                    )}
                                                    strokeWidth={3}
                                                />
                                            </span>
                                            {t(CHANNEL_LABEL[channel])}
                                        </button>
                                    </li>
                                )
                            }}
                        </For>
                    </ul>
                </Popover.Content>
            </Popover.Positioner>
        </Portal>
    </Popover.Root>
)
