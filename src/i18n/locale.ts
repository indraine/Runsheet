import { createSignal } from "solid-js"

export const LOCALES = ["ru", "en"] as const

export type Locale = (typeof LOCALES)[number]

const DEFAULT_LOCALE: Locale = "en"

const LOCALE_KEY = "runsheet.locale"

export const isLocale = (value: string): value is Locale =>
    (LOCALES as readonly string[]).includes(value)

const readLocale = (): Locale => {
    if (typeof localStorage === "undefined") return DEFAULT_LOCALE
    try {
        const stored = localStorage.getItem(LOCALE_KEY)
        if (stored && isLocale(stored)) return stored
    } catch {
    }
    return DEFAULT_LOCALE
}

const applyLocale = (value: Locale): void => {
    if (typeof document === "undefined") return
    document.documentElement.lang = value
}

const [locale, setLocaleSignal] = createSignal<Locale>(readLocale())

export const setLocale = (value: Locale): void => {
    setLocaleSignal(value)
    try {
        localStorage.setItem(LOCALE_KEY, value)
    } catch {
    }
    applyLocale(value)
}

export { locale }

if (typeof document !== "undefined") applyLocale(locale())
