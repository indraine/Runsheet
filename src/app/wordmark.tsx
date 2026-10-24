import mark from "~/assets/wordmark.svg?raw"
import { t } from "~/i18n"
import { cn } from "~/ui"

type WordmarkProps = {
    class?: string
}

export const Wordmark = (props: WordmarkProps) => (
    <span
        class={cn(
            "inline-flex text-ink [&_svg]:h-full [&_svg]:w-auto",
            props.class
        )}
        role="img"
        aria-label={t("app.wordmark")}
        innerHTML={mark}
    />
)
