import { Menu } from "@ark-ui/solid/menu"
import { Check, Monitor, Moon, Sun } from "lucide-solid"
import { For, Show } from "solid-js"
import {
    THEMES,
    isThemePreference,
    setTheme,
    theme,
    type ThemePreference,
} from "~/app/theme"
import { t } from "~/i18n"
import { buttonVariants } from "~/ui"

const iconProps = { class: "size-4", strokeWidth: 1.75 }

/** Подпись режима в списке попапа. */
const themeLabel = (preference: ThemePreference): string => {
    switch (preference) {
        case "light":
            return t("app.themeLight")
        case "dark":
            return t("app.themeDark")
        case "system":
            return t("app.themeSystem")
    }
}

/** Иконка конкретного режима. Режим пункта не меняется, поэтому ветка статична. */
const ThemeGlyph = (props: { preference: ThemePreference }) => {
    switch (props.preference) {
        case "light":
            return <Sun {...iconProps} />
        case "dark":
            return <Moon {...iconProps} />
        case "system":
            return <Monitor {...iconProps} />
    }
}

/** Кнопка справа в шапке. Открывает попап: светлая, тёмная, системная. */
export const ThemeToggle = () => (
    <Menu.Root
        aria-label={t("app.theme")}
        positioning={{ placement: "bottom-end", gutter: 8 }}
    >
        <Menu.Trigger
            class={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label={t("app.theme")}
        >
            <Show when={theme() === "light"}>
                <Sun {...iconProps} />
            </Show>
            <Show when={theme() === "dark"}>
                <Moon {...iconProps} />
            </Show>
            <Show when={theme() === "system"}>
                <Monitor {...iconProps} />
            </Show>
        </Menu.Trigger>
        <Menu.Positioner>
            <Menu.Content class="z-50 min-w-40 rounded border border-line bg-surface p-1 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]">
                <Menu.RadioItemGroup
                    value={theme()}
                    onValueChange={details => {
                        if (isThemePreference(details.value))
                            setTheme(details.value)
                    }}
                >
                    <For each={THEMES}>
                        {preference => (
                            <Menu.RadioItem
                                value={preference}
                                class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink data-[state=checked]:text-accent"
                            >
                                <ThemeGlyph preference={preference} />
                                <span class="flex-1 text-left">
                                    {themeLabel(preference)}
                                </span>
                                <span class="flex size-3.5 items-center justify-center">
                                    <Show when={theme() === preference}>
                                        <Check
                                            class="size-3.5"
                                            strokeWidth={1.75}
                                        />
                                    </Show>
                                </span>
                            </Menu.RadioItem>
                        )}
                    </For>
                </Menu.RadioItemGroup>
            </Menu.Content>
        </Menu.Positioner>
    </Menu.Root>
)
