import { Route, Router } from "@solidjs/router";
import { lazy } from "solid-js";
import { App } from "~/app/app";
import { TimelinePage } from "~/app/pages/timeline";
import { WelcomePage } from "~/app/pages/welcome";
import { DatabaseProvider } from "~/db";

const AnalysisPage = lazy(() => import("~/app/pages/analysis"));

export function AppRoutes() {
  return (
    <DatabaseProvider>
      <Router root={App}>
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/" component={TimelinePage} />
        <Route path="/sessions/:sessionId/laps/:lapId" component={AnalysisPage} />
      </Router>
    </DatabaseProvider>
  );
}
