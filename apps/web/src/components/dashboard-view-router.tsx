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
  | "sessions"
  | "selectedSessionId"
  | "analytics"
  | "notifications"
  | "retention"
  | "sendAction"
  | "scheduleAction"
  | "contactAction"
  | "purgePreview"
  | "purgeAction"
  | "clearPurgePreview"
  | "onSend"
  | "onSchedule"
  | "onResolveContact"
  | "onPreviewPurge"
  | "onPurge"
  | "createUserAction"
  | "grantAction"
  | "disableAction"
  | "onCreateUser"
  | "onCreateGrant"
  | "onDisableUser"
  | "sessionLifecycleAction"
  | "sessionHistoryAction"
  | "onLifecycle"
  | "onLoadHistory"
  | "schedules"
  | "selectedScheduleId"
  | "detail"
  | "editAction"
  | "cancelAction"
  | "selectSchedule"
  | "selectSession"
  | "editSchedule"
  | "cancelSchedule"
  | "notificationHistory"
  | "notificationSettingsAction"
  | "notificationPreferencesAction"
  | "notificationTestAction"
  | "retentionPolicyAction"
  | "loadNotificationHistory"
  | "saveNotificationSettings"
  | "saveNotificationPreferences"
  | "testNotifications"
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
        />
      )
    case "sessions":
      return (
        <SessionsPage
          scope={context.scope}
          sessions={context.sessions}
          lifecycleAction={context.sessionLifecycleAction}
          historyAction={context.sessionHistoryAction}
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
        />
      )
    case "send":
      return (
        <SendPage
          scope={context.scope}
          role={context.role}
          sessions={context.sessions}
          action={context.sendAction}
          onSend={context.onSend}
          onSchedule={context.onSchedule}
        />
      )
    case "schedule":
      return (
        <SchedulePage
          scope={context.scope}
          role={context.role}
          sessions={context.sessions}
          selectedSessionId={context.selectedSessionId}
          action={context.scheduleAction}
          onSend={context.onSend}
          onSchedule={context.onSchedule}
          schedules={context.schedules}
          selectedScheduleId={context.selectedScheduleId}
          detail={context.detail}
          editAction={context.editAction}
          cancelAction={context.cancelAction}
          selectSession={context.selectSession}
          selectSchedule={context.selectSchedule}
          editSchedule={context.editSchedule}
          cancelSchedule={context.cancelSchedule}
        />
      )
    case "analytics":
      return <AnalyticsPage analytics={context.analytics} />
    case "notifications":
      return (
        <NotificationsPage
          scope={context.scope}
          role={context.role}
          notifications={context.notifications}
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
          createUserAction={context.createUserAction}
          grantAction={context.grantAction}
          disableAction={context.disableAction}
          onCreateUser={context.onCreateUser}
          onCreateGrant={context.onCreateGrant}
          onDisableUser={context.onDisableUser}
        />
      )
    case "settings":
      return <SettingsPage role={context.role} />
    default:
      return assertNever(view)
  }
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
