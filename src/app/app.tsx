import { Navigate, useLocation, type RouteSectionProps } from "@solidjs/router"
import { createEffect, Show, Suspense } from "solid-js"
import { Footer } from "~/app/footer"
import { Header } from "~/app/header"
import { LaunchAcc } from "~/app/launch-acc"
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
                <div class="flex h-full flex-col overflow-hidden bg-canvas text-ink">
                    <Header />
                    <LaunchAcc />
                    <main class="flex min-h-0 flex-1 flex-col">
                        <Suspense>{props.children}</Suspense>
                    </main>
                    <Footer />
                </div>
            </Show>
        </Show>
    )
}
