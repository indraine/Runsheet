import { Navigate, useLocation, type RouteSectionProps } from "@solidjs/router"
import { createEffect, Show, Suspense } from "solid-js"
import { Footer } from "~/app/footer"
import { Header } from "~/app/header"
import { hasStarted } from "~/app/started"
import { locale } from "~/i18n/locale"

export function App(props: RouteSectionProps) {
    const location = useLocation()

    createEffect(() => {
        document.documentElement.lang = locale()
    })

    const onWelcome = () => location.pathname === "/welcome"

    return (
        <Show
            when={onWelcome() || hasStarted()}
            fallback={<Navigate href="/welcome" />}
        >
            <Show
                when={!onWelcome()}
                fallback={<Suspense>{props.children}</Suspense>}
            >
                <div class="flex min-h-dvh flex-col bg-canvas text-ink">
                    <Header />
                    <main class="flex-1">
                        <Suspense>{props.children}</Suspense>
                    </main>
                    <Footer />
                </div>
            </Show>
        </Show>
    )
}
