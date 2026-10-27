import { Route, Router } from "@solidjs/router"
import { App } from "~/app/app"
import { TelemetryPage } from "~/app/pages/telemetry"
import { TimelinePage } from "~/app/pages/timeline"
import { WelcomePage } from "~/app/pages/welcome"
import { DatabaseProvider } from "~/db"

export function AppRoutes() {
    return (
        <DatabaseProvider>
            <Router root={App}>
                <Route path="/welcome" component={WelcomePage} />
                <Route path="/" component={TimelinePage} />
                <Route path="/telemetry" component={TelemetryPage} />
            </Router>
        </DatabaseProvider>
    )
}
