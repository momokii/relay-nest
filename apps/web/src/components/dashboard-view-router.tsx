import type * as React from "react"
import { assertNever, type DashboardViewId } from "../dashboard-model"
import type { DashboardViewProps } from "./dashboard-view"
import {
  AnalyticsPage,
  ContactsPage,
  NotificationsPage,
  OverviewPage,
  RetentionPage,
  SchedulePage,
  SendPage,
  SessionsPage,
  SettingsPage,
  UsersPage,
} from "./view-pages"

type PageContext = Pick<
  DashboardViewProps,
  | "scope"
  | "role"
  | "principal"
  | "isDemo"
  | "sessions"
  | "analytics"
  | "notifications"
  | "retention"
  | "sendAction"
  | "scheduleAction"
  | "contactAction"
  | "purgePreview"
  | "purgeAction"
  | "clearPurgePreview"
  | "users"
  | "sessions"
  | "resetPasswordAction"
  | "onResetPassword"
  | "onSend"
  | "onSchedule"
  | "onResolveContact"
  | "contactConsentAction"
  | "onSetContactConsent"
  | "onPreviewPurge"
  | "onPurge"
  | "createUserAction"
  | "grantAction"
  | "disableAction"
  | "enableAction"
  | "sessionCreateAction"
  | "onCreateUser"
  | "onCreateGrant"
  | "onDisableUser"
  | "onEnableUser"
  | "onCreateSession"
  | "sessionLifecycleAction"
  | "sessionHistoryAction"
  | "onLifecycle"
  | "onLoadHistory"
  | "history"
  | "page"
  | "pageSize"
  | "q"
  | "stateFilter"
  | "from"
  | "to"
  | "detail"
  | "editAction"
  | "cancelAction"
  | "deleteAction"
  | "loadPage"
  | "setPageSize"
  | "setQ"
  | "setStateFilter"
  | "setFrom"
  | "setTo"
  | "selectJob"
  | "editJob"
  | "cancelJob"
  | "deleteJob"
  | "notificationHistory"
  | "notificationSettingsAction"
  | "notificationPreferencesAction"
  | "notificationTestAction"
  | "retentionPolicyAction"
  | "loadNotificationHistory"
  | "saveNotificationSettings"
  | "saveNotificationPreferences"
  | "testNotifications"
  | "analyticsWindow"
  | "setAnalyticsWindow"
  | "updateRetentionPolicy"
>

export function renderDashboardPage(
  view: DashboardViewId,
  context: PageContext,
): React.JSX.Element {
  switch (view) {
    case "overview":
      return (
        <OverviewPage
          scope={context.scope}
          sessions={context.sessions}
          analytics={context.analytics}
          analyticsWindow={context.analyticsWindow}
          onAnalyticsWindowChange={context.setAnalyticsWindow}
        />
      )
    case "sessions":
      return (
        <SessionsPage
          key={context.scope}
          scope={context.scope}
          role={context.role}
          sessions={context.sessions}
          createAction={context.sessionCreateAction}
          lifecycleAction={context.sessionLifecycleAction}
          historyAction={context.sessionHistoryAction}
          onCreate={context.onCreateSession}
          onLifecycle={context.onLifecycle}
          onLoadHistory={context.onLoadHistory}
        />
      )
    case "contacts":
      return (
        <ContactsPage
          scope={context.scope}
          role={context.role}
          sessions={context.sessions}
          action={context.contactAction}
          onResolve={context.onResolveContact}
          consentAction={context.contactConsentAction}
          onSetConsent={context.onSetContactConsent}
        />
      )
    case "send":
      return (
        <SendPage
          scope={context.scope}
          role={context.role}
          sessions={context.sessions}
          action={context.sendAction}
          contactAction={context.contactAction}
          consentAction={context.contactConsentAction}
          onResolve={context.onResolveContact}
          onSetConsent={context.onSetContactConsent}
          onSend={context.onSend}
          onSchedule={context.onSchedule}
          history={context.history}
          page={context.page}
          pageSize={context.pageSize}
          q={context.q}
          stateFilter={context.stateFilter}
          from={context.from}
          to={context.to}
          detail={context.detail}
          editAction={context.editAction}
          cancelAction={context.cancelAction}
          deleteAction={context.deleteAction}
          loadPage={context.loadPage}
          setPageSize={context.setPageSize}
          setQ={context.setQ}
          setStateFilter={context.setStateFilter}
          setFrom={context.setFrom}
          setTo={context.setTo}
          selectJob={context.selectJob}
          editJob={context.editJob}
          cancelJob={context.cancelJob}
          deleteJob={context.deleteJob}
        />
      )
    case "schedule":
      return (
        <SchedulePage
          scope={context.scope}
          role={context.role}
          sessions={context.sessions}
          action={context.scheduleAction}
          contactAction={context.contactAction}
          consentAction={context.contactConsentAction}
          onResolve={context.onResolveContact}
          onSetConsent={context.onSetContactConsent}
          onSend={context.onSend}
          onSchedule={context.onSchedule}
          history={context.history}
          page={context.page}
          pageSize={context.pageSize}
          q={context.q}
          stateFilter={context.stateFilter}
          from={context.from}
          to={context.to}
          detail={context.detail}
          editAction={context.editAction}
          cancelAction={context.cancelAction}
          deleteAction={context.deleteAction}
          loadPage={context.loadPage}
          setPageSize={context.setPageSize}
          setQ={context.setQ}
          setStateFilter={context.setStateFilter}
          setFrom={context.setFrom}
          setTo={context.setTo}
          selectJob={context.selectJob}
          editJob={context.editJob}
          cancelJob={context.cancelJob}
          deleteJob={context.deleteJob}
        />
      )
    case "campaigns":
      return (
        <div className="panel panel-warning">
          <h2 style={{ margin: 0 }}>Campaigns — Under development</h2>
          <p className="panel-description" style={{ marginTop: "0.5rem" }}>
            This menu is not accessible yet. Reaction campaigns are flagged as{" "}
            <strong>UNSTABLE</strong> and remain under active development. The page and its actions
            are disabled until the feature is ready.
          </p>
        </div>
      )
    case "analytics":
      return (
        <AnalyticsPage
          analytics={context.analytics}
          analyticsWindow={context.analyticsWindow}
          onAnalyticsWindowChange={context.setAnalyticsWindow}
        />
      )
    case "notifications":
      return (
        <NotificationsPage
          key={context.scope}
          scope={context.scope}
          role={context.role}
          notifications={notificationStateForScope(context.notifications, context.scope)}
          notificationHistory={context.notificationHistory}
          notificationSettingsAction={context.notificationSettingsAction}
          notificationPreferencesAction={context.notificationPreferencesAction}
          notificationTestAction={context.notificationTestAction}
          onLoadNotificationHistory={context.loadNotificationHistory}
          onSaveSettings={context.saveNotificationSettings}
          onSavePreferences={context.saveNotificationPreferences}
          onTest={context.testNotifications}
        />
      )
    case "retention":
      return (
        <RetentionPage
          scope={context.scope}
          role={context.role}
          retention={context.retention}
          purgePreview={context.purgePreview}
          onPreview={context.onPreviewPurge}
          onPurge={context.onPurge}
          purgeAction={context.purgeAction}
          retentionPolicyAction={context.retentionPolicyAction}
          onUpdatePolicy={context.updateRetentionPolicy}
          onCancelPreview={context.clearPurgePreview}
        />
      )
    case "users":
      return (
        <UsersPage
          role={context.role}
          users={context.users}
          sessions={context.sessions}
          createUserAction={context.createUserAction}
          grantAction={context.grantAction}
          disableAction={context.disableAction}
          enableAction={context.enableAction}
          resetPasswordAction={context.resetPasswordAction}
          onCreateUser={context.onCreateUser}
          onCreateGrant={context.onCreateGrant}
          onDisableUser={context.onDisableUser}
          onEnableUser={context.onEnableUser}
          onResetPassword={context.onResetPassword}
        />
      )
    case "settings":
      return (
        <SettingsPage
          role={context.role}
          scope={context.scope}
          principal={context.principal}
          sessions={context.sessions}
          users={context.users}
          retention={context.retention}
          isDemo={context.isDemo}
        />
      )
    default:
      return assertNever(view)
  }
}

function notificationStateForScope(
  state: DashboardViewProps["notifications"],
  scope: DashboardViewProps["scope"],
): DashboardViewProps["notifications"] {
  if (state.kind === "ready" && state.data.accountScope !== scope) return { kind: "loading" }
  return state
}

export function pageDefinition(
  view: DashboardViewId,
): Readonly<{ title: string; eyebrow: string; description: string }> {
  switch (view) {
    case "overview":
      return {
        title: "Operational overview",
        eyebrow: "Command center",
        description:
          "A scoped view of what the system knows, what it cannot verify, and what needs a human.",
      }
    case "sessions":
      return {
        title: "Session posture",
        eyebrow: "Transport",
        description: "Keep service health, session state, and sending readiness distinct.",
      }
    case "contacts":
      return {
        title: "Contact resolution",
        eyebrow: "Recipients",
        description: "Resolve one consent-aware individual target before a message action.",
      }
    case "send":
      return {
        title: "Immediate text",
        eyebrow: "Individual text",
        description: "Submit one text through an authorized session with visible recovery states.",
      }
    case "schedule":
      return {
        title: "One-time scheduling",
        eyebrow: "Durable jobs",
        description: "Record one future dispatch with an explicit timezone and no recurrence.",
      }
    case "campaigns":
      return {
        title: "Reaction campaigns",
        eyebrow: "Group automation",
        description: "Schedule one human-configured reaction campaign inside the active scope.",
      }
    case "analytics":
      return {
        title: "Scoped evidence",
        eyebrow: "Analytics",
        description: "Read projections without inferring delivery from incomplete events.",
      }
    case "notifications":
      return {
        title: "Failure paths",
        eyebrow: "Notifications",
        description: "Keep operational alerts independently visible and safely masked.",
      }
    case "retention":
      return {
        title: "Data lifecycle",
        eyebrow: "Admin controls",
        description: "Review policy and preview selected deletion before confirming it.",
      }
    case "users":
      return {
        title: "Users and grants",
        eyebrow: "Access",
        description: "Admin-created users and explicit session grants define access.",
      }
    case "settings":
      return {
        title: "Workspace policy",
        eyebrow: "Settings",
        description: "Safe boundaries remain visible where a settings route is not yet available.",
      }
    default:
      return assertNever(view)
  }
}
