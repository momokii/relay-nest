import { useEffect, useMemo, useState } from "react"

import {
  type AnalyticsView,
  type ContactView,
  createDashboardApi,
  type NotificationSettings,
  type Principal,
  type RetentionPolicy,
  type RetentionPreview,
  type ScheduleInput,
  type SendInput,
  type SendResult,
  type SessionView,
} from "./dashboard-api"
import { createDashboardAuthApi } from "./dashboard-auth-api"
import type { AccountScope, DashboardRole, DashboardViewId } from "./dashboard-model"
import {
  type ActionState,
  actionFromResult,
  type ResourceState,
  resourceFromResult,
} from "./dashboard-state"

export type DashboardController = Readonly<{
  activeView: DashboardViewId
  scope: AccountScope
  isNavOpen: boolean
  principal: ResourceState<Principal>
  activePrincipal: Principal | undefined
  role: DashboardRole
  isDemo: boolean
  sessions: ResourceState<readonly SessionView[]>
  analytics: ResourceState<AnalyticsView>
  notifications: ResourceState<NotificationSettings>
  retention: ResourceState<readonly RetentionPolicy[]>
  sendAction: ActionState<SendResult>
  scheduleAction: ActionState<SendResult>
  contactAction: ActionState<ContactView>
  purgePreview: ActionState<RetentionPreview>
  purgeAction: ActionState<{ readonly deletedCount: number }>
  clearPurgePreview: () => void
  setActiveView: (view: DashboardViewId) => void
  setScope: (scope: AccountScope) => void
  toggleNav: () => void
  logout: () => Promise<void>
  send: (input: SendInput) => Promise<void>
  schedule: (input: ScheduleInput) => Promise<void>
  resolveContact: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
  previewPurge: (scope: AccountScope, category: string) => Promise<void>
  purge: (
    scope: AccountScope,
    input: Readonly<{
      category: string
      cutoff: string
      previewCount: number
      previewToken: string
    }>,
  ) => Promise<void>
}>

export function useDashboardController(): DashboardController {
  const api = useMemo(() => createDashboardApi(import.meta.env.VITE_API_BASE_URL), [])
  const auth = useMemo(() => createDashboardAuthApi(import.meta.env.VITE_API_BASE_URL), [])
  const [activeView, setActiveView] = useState<DashboardViewId>("overview")
  const [scope, setScope] = useState<AccountScope>("personal")
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [principal, setPrincipal] = useState<ResourceState<Principal>>({ kind: "loading" })
  const [sessions, setSessions] = useState<ResourceState<readonly SessionView[]>>({
    kind: "loading",
  })
  const [analytics, setAnalytics] = useState<ResourceState<AnalyticsView>>({ kind: "loading" })
  const [notifications, setNotifications] = useState<ResourceState<NotificationSettings>>({
    kind: "loading",
  })
  const [retention, setRetention] = useState<ResourceState<readonly RetentionPolicy[]>>({
    kind: "loading",
  })
  const [sendAction, setSendAction] = useState<ActionState<SendResult>>({ kind: "idle" })
  const [scheduleAction, setScheduleAction] = useState<ActionState<SendResult>>({ kind: "idle" })
  const [contactAction, setContactAction] = useState<ActionState<ContactView>>({ kind: "idle" })
  const [purgePreview, setPurgePreview] = useState<ActionState<RetentionPreview>>({ kind: "idle" })
  const [purgeAction, setPurgeAction] = useState<ActionState<{ readonly deletedCount: number }>>({
    kind: "idle",
  })

  useEffect(() => {
    let isCurrent = true
    void api
      .getPrincipal()
      .then((result) => {
        if (isCurrent) setPrincipal(resourceFromResult(result))
      })
      .catch(() => {
        if (isCurrent)
          setPrincipal({ kind: "error", message: "The authenticated principal could not be read." })
      })
    return () => {
      isCurrent = false
    }
  }, [api])

  const activePrincipal = principal.kind === "ready" ? principal.data : undefined
  const role = activePrincipal?.user.rolesByScope[scope]?.[0] ?? "viewer"

  useEffect(() => {
    let isCurrent = true
    if (!activePrincipal) {
      return () => {
        isCurrent = false
      }
    }
    setSessions({
      kind: "loading",
    })
    setAnalytics({ kind: "loading" })
    setSendAction({ kind: "idle" })
    setScheduleAction({ kind: "idle" })
    setContactAction({ kind: "idle" })
    setPurgePreview({ kind: "idle" })
    setPurgeAction({ kind: "idle" })
    void Promise.all([api.getSessions(scope), api.getAnalytics(scope)])
      .then(([sessionResult, analyticsResult]) => {
        if (!isCurrent) return
        setSessions(resourceFromResult(sessionResult))
        setAnalytics(resourceFromResult(analyticsResult))
      })
      .catch(() => {
        if (!isCurrent) return
        const message = "The scoped dashboard data could not be read."
        setSessions({ kind: "error", message })
        setAnalytics({ kind: "error", message })
      })
    if (role === "admin") {
      void Promise.all([api.getNotifications(scope), api.getRetention(scope)])
        .then(([notificationResult, retentionResult]) => {
          if (!isCurrent) return
          setNotifications(resourceFromResult(notificationResult))
          setRetention(resourceFromResult(retentionResult))
        })
        .catch(() => {
          if (!isCurrent) return
          const message = "Admin controls could not be read."
          setNotifications({ kind: "error", message })
          setRetention({ kind: "error", message })
        })
    } else {
      setNotifications({ kind: "denied", message: "Notification settings require an Admin role." })
      setRetention({ kind: "denied", message: "Retention settings require an Admin role." })
    }
    return () => {
      isCurrent = false
    }
  }, [api, role, scope, activePrincipal])

  const send = async (input: SendInput): Promise<void> => {
    setSendAction({ kind: "submitting" })
    setSendAction(actionFromResult(await api.sendImmediate(input)))
  }
  const schedule = async (input: ScheduleInput): Promise<void> => {
    setScheduleAction({ kind: "submitting" })
    setScheduleAction(actionFromResult(await api.scheduleMessage(input)))
  }
  const resolveContact = async (
    selectedScope: AccountScope,
    sessionId: string,
    recipient: string,
  ): Promise<void> => {
    setContactAction({ kind: "submitting" })
    setContactAction(
      actionFromResult(await api.resolveContact(selectedScope, sessionId, recipient)),
    )
  }
  const previewPurge = async (selectedScope: AccountScope, category: string): Promise<void> => {
    setPurgePreview({ kind: "submitting" })
    setPurgePreview(actionFromResult(await api.previewPurge(selectedScope, category)))
  }
  const purge = async (
    selectedScope: AccountScope,
    input: Readonly<{
      category: string
      cutoff: string
      previewCount: number
      previewToken: string
    }>,
  ): Promise<void> => {
    setPurgeAction({ kind: "submitting" })
    setPurgeAction(actionFromResult(await api.purge(selectedScope, input)))
  }
  const clearPurgePreview = (): void => setPurgePreview({ kind: "idle" })
  const logout = async (): Promise<void> => {
    const result = await auth.logout()
    if (result.kind === "ready") {
      setPrincipal({
        kind: "denied",
        message: "Authentication is required to view this command center.",
      })
    }
  }

  return {
    activeView,
    scope,
    isNavOpen,
    principal,
    activePrincipal,
    role,
    isDemo: false,
    sessions,
    analytics,
    notifications,
    retention,
    sendAction,
    scheduleAction,
    contactAction,
    purgePreview,
    purgeAction,
    clearPurgePreview,
    setActiveView,
    setScope,
    toggleNav: () => setIsNavOpen((current) => !current),
    logout,
    send,
    schedule,
    resolveContact,
    previewPurge,
    purge,
  }
}
