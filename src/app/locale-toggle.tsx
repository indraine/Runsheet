import { t } from "~/i18n"
import { locale, setLocale } from "~/i18n/locale"
import { buttonVariants } from "~/ui"

export const LocaleToggle = () => (
    <button
        type="button"
        class={buttonVariants({ variant: "ghost", size: "icon" })}
        aria-label={t("app.language")}
        onClick={() => setLocale(locale() === "ru" ? "en" : "ru")}
    >
        {locale() === "ru" ? "RU" : "EN"}
    </button>
)
