import { batch, createSignal } from "solid-js"

const THEME_KEY = "runsheet.theme"

export const APPEARANCE = ["light", "dark", "system"] as const

export const SCHEMES = [
    "slate",
    "darcula",
    "dracula",
    "monokai",
    "nord",
    "mocha",
    "gruvbox",
    "everforest",
    "one-dark",
    "solarized-dark",
    "solarized-light",
] as const

export const THEMES = [...APPEARANCE, ...SCHEMES] as const

export type ThemePreference = (typeof THEMES)[number]
export type ThemeScheme = (typeof SCHEMES)[number]
export type ResolvedTheme = Exclude<ThemePreference, "system">

const COLOR_SCHEME: Record<ResolvedTheme, "light" | "dark"> = {
    light: "light",
    dark: "dark",
    slate: "dark",
    darcula: "dark",
    dracula: "dark",
    monokai: "dark",
    nord: "dark",
    mocha: "dark",
    gruvbox: "dark",
    everforest: "dark",
    "one-dark": "dark",
    "solarized-dark": "dark",
    "solarized-light": "light",
}

export const THEME_SWATCH: Record<ThemeScheme, string> = {
    slate: "#7eb0ef",
    darcula: "#6897bb",
    dracula: "#bd93f9",
    monokai: "#66d9ef",
    nord: "#88c0d0",
    mocha: "#89b4fa",
    gruvbox: "#fe8019",
    everforest: "#a7c080",
    "one-dark": "#61afef",
    "solarized-dark": "#268bd2",
    "solarized-light": "#268bd2",
}

export const isThemePreference = (value: string): value is ThemePreference =>
    (THEMES as readonly string[]).includes(value)

export const isThemeScheme = (
    preference: ThemePreference
): preference is ThemeScheme =>
    (SCHEMES as readonly string[]).includes(preference)

export const resolveTheme = (
    preference: ThemePreference,
    systemDark: boolean
): ResolvedTheme => {
    if (preference === "system") return systemDark ? "dark" : "light"
    return preference
}

export const colorSchemeOf = (resolved: ResolvedTheme): "light" | "dark" =>
    COLOR_SCHEME[resolved]

const readPreference = (): ThemePreference => {
    if (typeof localStorage === "undefined") return "light"
    try {
        const stored = localStorage.getItem(THEME_KEY)
        if (stored && isThemePreference(stored)) return stored
    } catch {
    }
    return "light"
}

const systemPrefersDark = (): boolean =>
    window.matchMedia("(prefers-color-scheme: dark)").matches

const applyTheme = (preference: ThemePreference): void => {
    const resolved = resolveTheme(preference, systemPrefersDark())
    const scheme = colorSchemeOf(resolved)
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = scheme
    const canvas = getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim()
    if (!canvas) return
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", canvas)
}

const [theme, setThemeSignal] = createSignal<ThemePreference>(readPreference())

/**
 * Bumps after the document theme colors are already applied.
 *
 * Canvas views read CSS variables while drawing. The preference signal
 * notifies them synchronously, so the dataset has to change first.
 */
const [themeGeneration, setThemeGeneration] = createSignal(0)

const publishAppliedTheme = (preference: ThemePreference): void => {
    if (typeof document !== "undefined") applyTheme(preference)
    batch(() => {
        setThemeSignal(preference)
        setThemeGeneration(value => value + 1)
    })
}

export const setTheme = (preference: ThemePreference): void => {
    try {
        localStorage.setItem(THEME_KEY, preference)
    } catch {
        // Storage can be unavailable in private mode. The page still paints.
    }
    publishAppliedTheme(preference)
}

export { theme, themeGeneration }

if (typeof document !== "undefined") {
    applyTheme(theme())
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
            if (theme() === "system") publishAppliedTheme("system")
        })
}
