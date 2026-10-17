import { createSignal } from "solid-js"

/** Тот же ключ читает скрипт в index.html до первой отрисовки. */
const THEME_KEY = "runsheet.theme"
const LIGHT_CANVAS = "#f8fafc"
const DARK_CANVAS = "#0b1220"

export const THEMES = ["light", "dark", "system"] as const

export type ThemePreference = (typeof THEMES)[number]
export type ResolvedTheme = "light" | "dark"

/** Проверяет, что строка — один из трёх режимов темы. */
export const isThemePreference = (value: string): value is ThemePreference =>
    (THEMES as readonly string[]).includes(value)

/**
 * Светлая и тёмная возвращаются как есть.
 * Системная повторяет тёмную схему ОС.
 */
export const resolveTheme = (
    preference: ThemePreference,
    systemDark: boolean
): ResolvedTheme => {
    if (preference === "system") return systemDark ? "dark" : "light"
    return preference
}

const readPreference = (): ThemePreference => {
    if (typeof localStorage === "undefined") return "light"
    try {
        const stored = localStorage.getItem(THEME_KEY)
        if (stored && isThemePreference(stored)) return stored
    } catch {
        /* хранилище недоступно */
    }
    return "light"
}

const systemPrefersDark = (): boolean =>
    window.matchMedia("(prefers-color-scheme: dark)").matches

/** Красит документ уже разрешённой темой, без значения «системная». */
const applyTheme = (preference: ThemePreference): void => {
    const resolved = resolveTheme(preference, systemPrefersDark())
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
            "content",
            resolved === "dark" ? DARK_CANVAS : LIGHT_CANVAS
        )
}

const [theme, setThemeSignal] = createSignal<ThemePreference>(readPreference())

/** Запоминает выбор и сразу применяет его к документу. */
export const setTheme = (preference: ThemePreference): void => {
    setThemeSignal(preference)
    try {
        localStorage.setItem(THEME_KEY, preference)
    } catch {
        /* хранилище недоступно */
    }
    if (typeof document !== "undefined") applyTheme(preference)
}

export { theme }

if (typeof document !== "undefined") {
    applyTheme(theme())
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
            if (theme() === "system") applyTheme("system")
        })
}
