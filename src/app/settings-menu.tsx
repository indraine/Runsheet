import { Menu } from "@ark-ui/solid/menu"
import { RotateCcw, Settings } from "lucide-solid"
import { resetSettings } from "~/app/stored"
import { t } from "~/i18n"
import { buttonVariants } from "~/ui"

const itemClass =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink"

/** Шестерёнка справа от темы. */
export const SettingsMenu = () => (
    <Menu.Root
        aria-label={t("app.settings")}
        positioning={{ placement: "bottom-end", gutter: 8 }}
        onSelect={details => {
            if (details.value === "reset") resetSettings()
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
                <Menu.Item value="reset" class={itemClass}>
                    <RotateCcw class="size-4" strokeWidth={1.75} />
                    <span class="flex-1 text-left">
                        {t("app.resetSettings")}
                    </span>
                </Menu.Item>
            </Menu.Content>
        </Menu.Positioner>
    </Menu.Root>
)
