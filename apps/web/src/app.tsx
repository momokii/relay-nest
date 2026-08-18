import type * as React from "react"

import { useDashboardAdminController } from "./admin-controller"
import { AppShell } from "./components/app-shell"
import { AuthBoundary } from "./components/auth-boundary"
import { DashboardView } from "./components/dashboard-view"
import { useDashboardController } from "./dashboard-controller"
import { useDashboardOperationsController } from "./operations-controller"
import { useDashboardScheduleController } from "./schedule-controller"
import { useDashboardSessionController } from "./session-controller"
import "./styles.css"

export function App(): React.JSX.Element {
  const dashboard = useDashboardController()
  const admin = useDashboardAdminController()
  const session = useDashboardSessionController()
  const schedule = useDashboardScheduleController(dashboard.scope, dashboard.sessions)
  const operations = useDashboardOperationsController(dashboard.scope, dashboard.role)
  if (!dashboard.activePrincipal) return <AuthBoundary state={dashboard.principal} />
  return (
    <AppShell
      activeView={dashboard.activeView}
      scope={dashboard.scope}
      principal={dashboard.activePrincipal}
      isDemo={dashboard.isDemo}
      isNavOpen={dashboard.isNavOpen}
      onViewChange={dashboard.setActiveView}
      onScopeChange={dashboard.setScope}
      onNavToggle={dashboard.toggleNav}
      onLogout={dashboard.logout}
    >
      <DashboardView
        {...dashboard}
        {...admin}
        principal={dashboard.activePrincipal}
        onSend={dashboard.send}
        onSchedule={dashboard.schedule}
        onResolveContact={dashboard.resolveContact}
        onPreviewPurge={dashboard.previewPurge}
        onPurge={dashboard.purge}
        onCreateUser={admin.createUser}
        onCreateGrant={admin.createGrant}
        onDisableUser={admin.disableUser}
        {...session}
        {...schedule}
        {...operations}
        onLifecycle={session.lifecycleSession}
        onLoadHistory={session.loadSessionHistory}
      />
    </AppShell>
  )
}
