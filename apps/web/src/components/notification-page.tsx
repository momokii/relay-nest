import type * as React from "react"

import type { NotificationSettings as DashboardNotificationSettings } from "../dashboard-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import type {
  NotificationHistoryEntry,
  NotificationPreferences,
  NotificationSettings,
  NotificationSettingsInput,
  NotificationTestResult,
} from "../dashboard-notification-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { NotificationSettingsForm } from "./notification-settings-form"
import { Panel, StateNotice } from "./ui"
import { ChannelCard, ResourceStateBody } from "./view-support"

export function NotificationsPage({
  scope,
  role,
  notifications,
  notificationHistory,
  notificationSettingsAction,
  notificationPreferencesAction,
  notificationTestAction,
  onLoadNotificationHistory,
  onSaveSettings,
  onSavePreferences,
  onTest,
}: Readonly<{
  scope: AccountScope
  role: DashboardRole
  notifications: ResourceState<DashboardNotificationSettings>
  notificationHistory: ResourceState<readonly NotificationHistoryEntry[]>
  notificationSettingsAction: ActionState<NotificationSettings>
  notificationPreferencesAction: ActionState<null>
  notificationTestAction: ActionState<NotificationTestResult>
  onLoadNotificationHistory: (scope: AccountScope) => Promise<void>
  onSaveSettings: (scope: AccountScope, input: NotificationSettingsInput) => Promise<void>
  onSavePreferences: (scope: AccountScope, input: NotificationPreferences) => Promise<void>
  onTest: (scope: AccountScope, category: "security" | "delivery" | "operations") => Promise<void>
}>): React.JSX.Element {
  if (role !== "admin")
    return (
      <Panel eyebrow="Admin only" title="Notifications">
        <StateNotice
          title="Role denied"
          message="Notification provider settings are available only to an Admin in the selected scope."
          tone="warning"
        />
      </Panel>
    )
  const settings = notifications.kind === "ready" ? notifications.data : undefined
  return (
    <div className="page-grid">
      <Panel
        eyebrow="Failure paths"
        title="Notifications"
        description="Email and Telegram are independent operational channels."
      >
        <ResourceStateBody
          state={notifications}
          emptyTitle="No notification configuration"
          emptyMessage={`No ${scope} notification settings are available.`}
        />
        {settings ? (
          <div className="channel-grid">
            <ChannelCard
              label="Email"
              enabled={settings.email.enabled}
              configured={settings.email.configured}
            />
            <ChannelCard
              label="Telegram"
              enabled={settings.telegram.enabled}
              configured={settings.telegram.configured}
            />
          </div>
        ) : null}
      </Panel>
      <Panel eyebrow="Provider settings" title="Admin notification controls" tone="inset">
        <NotificationSettingsForm
          scope={scope}
          action={notificationSettingsAction}
          onSave={onSaveSettings}
        />
        <button
          className="button button-secondary"
          type="button"
          onClick={() =>
            void onSavePreferences(scope, {
              security: { email: false, telegram: false },
              delivery: { email: false, telegram: false },
              operations: { email: true, telegram: true },
            })
          }
          disabled={notificationPreferencesAction.kind === "submitting"}
        >
          {notificationPreferencesAction.kind === "submitting"
            ? "Saving preferences…"
            : "Save operations preferences"}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void onTest(scope, "operations")}
          disabled={notificationTestAction.kind === "submitting"}
        >
          {notificationTestAction.kind === "submitting" ? "Testing…" : "Send operations test"}
        </button>
        {notificationTestAction.kind === "ready" ? (
          <StateNotice
            title="Test completed"
            message={`Email: ${notificationTestAction.data.email}; Telegram: ${notificationTestAction.data.telegram}.`}
          />
        ) : null}
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void onLoadNotificationHistory(scope)}
        >
          Reload failure history
        </button>
        <ResourceStateBody
          state={notificationHistory}
          emptyTitle="No failure history"
          emptyMessage="No notification attempts are recorded for this scope."
        />
        {notificationHistory.kind === "ready" ? (
          <ul className="plain-list">
            {notificationHistory.data.map((entry) => (
              <li key={entry.id}>
                {entry.channel} · {entry.state} · {entry.category}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  )
}
