import { For } from "solid-js"
import { LOCALES, isLocale, locale, setLocale } from "~/i18n/locale"
import { t } from "~/i18n"
import { Tabs } from "~/ui"

const NAMES = { ru: "Русский", en: "English" } as const

/** Both languages at once, each in its own language, so it is findable by a reader of either. */
export const LocaleSwitch = () => (
    <Tabs.Root
        value={locale()}
        onValueChange={details => {
            if (isLocale(details.value)) setLocale(details.value)
        }}
    >
        <Tabs.List aria-label={t("app.language")}>
            <For each={LOCALES}>
                {code => (
                    <Tabs.Trigger value={code} lang={code}>
                        {NAMES[code]}
                    </Tabs.Trigger>
                )}
            </For>
        </Tabs.List>
    </Tabs.Root>
)
