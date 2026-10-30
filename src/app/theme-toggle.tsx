import { Select, createListCollection } from "@ark-ui/solid/select"
import { Check, Monitor, Moon, Palette, Sun } from "lucide-solid"
import { For, Match, Switch, createMemo } from "solid-js"
import { Portal } from "solid-js/web"
import { screenPopupClass, screenPositioning } from "~/app/screen-position"
import {
    APPEARANCE,
    SCHEMES,
    THEME_SWATCH,
    isThemePreference,
    isThemeScheme,
    setTheme,
    theme,
    type ThemePreference,
} from "~/app/theme"
import { t } from "~/i18n"
import { buttonVariants } from "~/ui"

const iconProps = { class: "size-4", strokeWidth: 1.75 }

const LABEL_KEY = {
    light: "app.themeLight",
    dark: "app.themeDark",
    system: "app.themeSystem",
    slate: "app.themeSlate",
    darcula: "app.themeDarcula",
    dracula: "app.themeDracula",
    monokai: "app.themeMonokai",
    nord: "app.themeNord",
    mocha: "app.themeMocha",
    gruvbox: "app.themeGruvbox",
    everforest: "app.themeEverforest",
    "one-dark": "app.themeOneDark",
    "solarized-dark": "app.themeSolarizedDark",
    "solarized-light": "app.themeSolarizedLight",
} as const satisfies Record<ThemePreference, `app.${string}`>

const themeLabel = (preference: ThemePreference): string =>
    t(LABEL_KEY[preference])

const itemClass =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-mono text-[12px] text-secondary outline-none data-highlighted:bg-inset data-highlighted:text-ink data-[state=checked]:text-accent"

export const ThemeToggle = () => {
    const collection = createMemo(() =>
        createListCollection<ThemePreference>({
            items: [...APPEARANCE, ...SCHEMES],
            itemToValue: item => item,
            itemToString: item => themeLabel(item),
        })
    )

    return (
        <Select.Root
            collection={collection()}
            value={[theme()]}
            positioning={screenPositioning({ placement: "bottom-end" })}
            onValueChange={details => {
                const next = details.value[0]
                if (next && isThemePreference(next)) setTheme(next)
            }}
        >
            <Select.Control>
                <Select.Trigger
                    class={buttonVariants({ variant: "ghost", size: "icon" })}
                    aria-label={t("app.theme")}
                >
                    <TriggerGlyph preference={theme()} />
                </Select.Trigger>
            </Select.Control>
            <Portal>
                <Select.Positioner class={screenPopupClass}>
                    <Select.Content class="z-50 min-w-44 rounded border border-line bg-surface p-1 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]">
                        <For each={APPEARANCE}>
                            {preference => (
                                <ThemeChoice preference={preference} />
                            )}
                        </For>
                        <div class="my-1 h-px bg-line" />
                        <For each={SCHEMES}>
                            {preference => (
                                <ThemeChoice preference={preference} />
                            )}
                        </For>
                    </Select.Content>
                </Select.Positioner>
            </Portal>
        </Select.Root>
    )
}

const ThemeChoice = (props: { preference: ThemePreference }) => (
    <Select.Item item={props.preference} class={itemClass}>
        <ThemeMark preference={props.preference} />
        <Select.ItemText class="flex-1 text-left">
            {themeLabel(props.preference)}
        </Select.ItemText>
        <Select.ItemIndicator class="flex size-3.5 items-center justify-center">
            <Check class="size-3.5" strokeWidth={1.75} />
        </Select.ItemIndicator>
    </Select.Item>
)

const TriggerGlyph = (props: { preference: ThemePreference }) => (
    <Switch>
        <Match when={props.preference === "system"}>
            <Monitor {...iconProps} />
        </Match>
        <Match when={props.preference === "light"}>
            <Sun {...iconProps} />
        </Match>
        <Match when={props.preference === "dark"}>
            <Moon {...iconProps} />
        </Match>
        <Match
            when={
                props.preference !== "system" &&
                props.preference !== "light" &&
                props.preference !== "dark"
            }
        >
            <Palette {...iconProps} />
        </Match>
    </Switch>
)

const ThemeMark = (props: { preference: ThemePreference }) => {
    if (!isThemeScheme(props.preference)) {
        return <TriggerGlyph preference={props.preference} />
    }
    return (
        <span
            class="flex size-4 items-center justify-center"
            aria-hidden="true"
        >
            <span
                class="size-2.5 rounded-full"
                style={{ "background-color": THEME_SWATCH[props.preference] }}
            />
        </span>
    )
}
