import { useEffect, useMemo, useState } from "react"

import type { AccountScope, DashboardRole } from "./dashboard-model"
import {
  createDashboardNotificationApi,
  type NotificationHistoryEntry,
  type NotificationPreferences,
  type NotificationSettings,
  type NotificationSettingsInput,
  type NotificationTestResult,
} from "./dashboard-notification-api"
import {
  createDashboardRetentionApi,
  type RetentionPolicy,
  type RetentionPolicyInput,
} from "./dashboard-retention-api"
import {
  type ActionState,
  actionFromResult,
  type ResourceState,
  resourceFromResult,
} from "./dashboard-state"

export type DashboardOperationsController = Readonly<{
  notificationHistory: ResourceState<readonly NotificationHistoryEntry[]>
  notificationSettingsAction: ActionState<NotificationSettings>
  notificationPreferencesAction: ActionState<null>
  notificationTestAction: ActionState<NotificationTestResult>
  retentionPolicyAction: ActionState<RetentionPolicy>
  loadNotificationHistory: (scope: AccountScope) => Promise<void>
  saveNotificationSettings: (scope: AccountScope, input: NotificationSettingsInput) => Promise<void>
  saveNotificationPreferences: (
    scope: AccountScope,
    input: NotificationPreferences,
  ) => Promise<void>
  testNotifications: (
    scope: AccountScope,
    category: "security" | "delivery" | "operations",
  ) => Promise<void>
  updateRetentionPolicy: (scope: AccountScope, input: RetentionPolicyInput) => Promise<void>
}>

export function useDashboardOperationsController(
  scope: AccountScope,
  role: DashboardRole,
): DashboardOperationsController {
  const notifications = useMemo(
    () => createDashboardNotificationApi(import.meta.env.VITE_API_BASE_URL),
    [],
  )
  const retention = useMemo(
    () => createDashboardRetentionApi(import.meta.env.VITE_API_BASE_URL),
    [],
  )
  const [notificationHistory, setNotificationHistory] = useState<
    ResourceState<readonly NotificationHistoryEntry[]>
  >({ kind: "loading" })
  const [notificationSettingsAction, setNotificationSettingsAction] = useState<
    ActionState<NotificationSettings>
  >({ kind: "idle" })
  const [notificationPreferencesAction, setNotificationPreferencesAction] = useState<
    ActionState<null>
  >({ kind: "idle" })
  const [notificationTestAction, setNotificationTestAction] = useState<
    ActionState<NotificationTestResult>
  >({ kind: "idle" })
  const [retentionPolicyAction, setRetentionPolicyAction] = useState<ActionState<RetentionPolicy>>({
    kind: "idle",
  })

  useEffect(() => {
    let isCurrent = true
    setNotificationHistory({ kind: "loading" })
    setNotificationSettingsAction({ kind: "idle" })
    setNotificationPreferencesAction({ kind: "idle" })
    setNotificationTestAction({ kind: "idle" })
    setRetentionPolicyAction({ kind: "idle" })
    if (role !== "admin") {
      setNotificationHistory({ kind: "denied", message: "Admin notification history is denied." })
      return () => {
        isCurrent = false
      }
    }
    void notifications.history(scope).then((result) => {
      if (isCurrent) setNotificationHistory(resourceFromResult(result))
    })
    return () => {
      isCurrent = false
    }
  }, [notifications, role, scope])

  const loadNotificationHistory = async (selectedScope: AccountScope): Promise<void> => {
    setNotificationHistory({ kind: "loading" })
    setNotificationHistory(resourceFromResult(await notifications.history(selectedScope)))
  }
  const saveNotificationSettings = async (
    selectedScope: AccountScope,
    input: NotificationSettingsInput,
  ): Promise<void> => {
    setNotificationSettingsAction({ kind: "submitting" })
    setNotificationSettingsAction(
      actionFromResult(await notifications.saveSettings(selectedScope, input)),
    )
  }
  const saveNotificationPreferences = async (
    selectedScope: AccountScope,
    input: NotificationPreferences,
  ): Promise<void> => {
    setNotificationPreferencesAction({ kind: "submitting" })
    setNotificationPreferencesAction(
      actionFromResult(await notifications.savePreferences(selectedScope, input)),
    )
  }
  const testNotifications = async (
    selectedScope: AccountScope,
    category: "security" | "delivery" | "operations",
  ): Promise<void> => {
    setNotificationTestAction({ kind: "submitting" })
    setNotificationTestAction(actionFromResult(await notifications.test(selectedScope, category)))
  }
  const updateRetentionPolicy = async (
    selectedScope: AccountScope,
    input: RetentionPolicyInput,
  ): Promise<void> => {
    setRetentionPolicyAction({ kind: "submitting" })
    setRetentionPolicyAction(actionFromResult(await retention.updatePolicy(selectedScope, input)))
  }

  return {
    notificationHistory,
    notificationSettingsAction,
    notificationPreferencesAction,
    notificationTestAction,
    retentionPolicyAction,
    loadNotificationHistory,
    saveNotificationSettings,
    saveNotificationPreferences,
    testNotifications,
    updateRetentionPolicy,
  }
}
