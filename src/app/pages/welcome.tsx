import { Navigate, useNavigate } from "@solidjs/router"
import { LocaleSwitch } from "~/app/locale-switch"
import { hasStarted, markStarted } from "~/app/started"
import { Wordmark } from "~/app/wordmark"
import { t } from "~/i18n"
import { Button } from "~/ui/button"

export function WelcomePage() {
    const navigate = useNavigate()

    if (hasStarted()) return <Navigate href="/" />

    function start() {
        markStarted()
        navigate("/", { replace: true })
    }

    return (
        <div class="flex min-h-full items-center justify-center bg-canvas px-6 text-ink">
            <div class="flex w-full max-w-xl flex-col items-center text-center">
                <Wordmark class="h-32 max-w-full" />
                <p class="mt-10 text-xl leading-7 text-ink">
                    {t("app.welcomeSlogan")}
                </p>
                <p class="mt-2 text-sm leading-5 whitespace-pre-line text-secondary">
                    {t("app.welcomeBody")}
                </p>
                <Button class="mt-8 h-9 px-4" onClick={start}>
                    {t("app.start")}
                </Button>
                <div class="mt-6">
                    <LocaleSwitch />
                </div>
            </div>
        </div>
    )
}
