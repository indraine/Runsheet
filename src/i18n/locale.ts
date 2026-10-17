import { createSignal } from "solid-js"

export const LOCALES = ["ru", "en"] as const

export type Locale = (typeof LOCALES)[number]

const DEFAULT_LOCALE: Locale = "ru"

export const [locale, setLocale] = createSignal<Locale>(DEFAULT_LOCALE)
