import { useEffect, useMemo, useRef, useState } from "react"

import {
  type AnalyticsView,
  type ContactView,
  createDashboardApi,
  type Principal,
  type ScheduleInput,
  type SendInput,
  type SendResult,
  type SessionView,
} from "./dashboard-api"
import { createDashboardAuthApi } from "./dashboard-auth-api"
import {
  type AccountScope,
  type DashboardRole,
  type DashboardViewId,
  effectiveRole,
} from "./dashboard-model"
import {
  createDashboardNotificationApi,
  type NotificationSettings,
} from "./dashboard-notification-api"
import {
  createDashboardRetentionApi,
  type RetentionCategory,
  type RetentionPolicy,
  type RetentionPreview,
  type RetentionPurgeInput,
} from "./dashboard-retention-api"
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
  contactConsentAction: ActionState<{ readonly updated: boolean }>
  purgePreview: ActionState<RetentionPreview>
  purgeAction: ActionState<{ readonly deletedCount: number }>
  clearPurgePreview: () => void
  setActiveView: (view: DashboardViewId) => void
  setScope: (scope: AccountScope) => void
  currentScopeRequest: DashboardScopeRequest
  refreshSessions: (request: DashboardScopeRequest) => Promise<void>
  toggleNav: () => void
  logout: () => Promise<void>
  send: (input: SendInput) => Promise<void>
  schedule: (input: ScheduleInput) => Promise<void>
  resolveContact: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
  setContactConsent: (
    scope: AccountScope,
    sessionId: string,
    contactId: string,
    input: { readonly consentGranted: boolean; optedOut: boolean },
  ) => Promise<void>
  previewPurge: (scope: AccountScope, category: RetentionCategory) => Promise<void>
  purge: (scope: AccountScope, input: Omit<RetentionPurgeInput, "confirmed">) => Promise<void>
}>

export type DashboardScopeRequest = Readonly<{
  scope: AccountScope
  generation: number
}>

export function scopeRequestIsCurrent(
  currentScope: AccountScope,
  currentGeneration: number,
  request: DashboardScopeRequest,
): boolean {
  return request.scope === currentScope && request.generation === currentGeneration
}

export function requestTokenIsCurrent(currentToken: number, requestToken: number): boolean {
  return requestToken === currentToken
}

export function useDashboardController(): DashboardController {
  const api = useMemo(() => createDashboardApi(import.meta.env.VITE_API_BASE_URL), [])
  const auth = useMemo(() => createDashboardAuthApi(import.meta.env.VITE_API_BASE_URL), [])
  const notificationsApi = useMemo(
    () => createDashboardNotificationApi(import.meta.env.VITE_API_BASE_URL),
    [],
  )
  const retentionApi = useMemo(
    () => createDashboardRetentionApi(import.meta.env.VITE_API_BASE_URL),
    [],
  )
  const [activeView, setActiveView] = useState<DashboardViewId>("overview")
  const [scope, setScope] = useState<AccountScope>("personal")
  const scopeRef = useRef<AccountScope>(scope)
  const scopeGenerationRef = useRef(0)
  const contactResolutionTokenRef = useRef(0)
  const contactConsentTokenRef = useRef(0)
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
  const [contactConsentAction, setContactConsentAction] = useState<
    ActionState<{ readonly updated: boolean }>
  >({ kind: "idle" })
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
  const role = effectiveRole(activePrincipal?.user.rolesByScope[scope] ?? [])

  const setDashboardScope = (nextScope: AccountScope): void => {
    if (scopeRef.current === nextScope) return
    scopeRef.current = nextScope
    scopeGenerationRef.current += 1
    contactResolutionTokenRef.current += 1
    contactConsentTokenRef.current += 1
    setScope(nextScope)
    setSessions({ kind: "loading" })
    setAnalytics({ kind: "loading" })
    setNotifications({ kind: "loading" })
    setRetention({ kind: "loading" })
    setSendAction({ kind: "idle" })
    setScheduleAction({ kind: "idle" })
    setContactAction({ kind: "idle" })
    setContactConsentAction({ kind: "idle" })
    setPurgePreview({ kind: "idle" })
    setPurgeAction({ kind: "idle" })
  }

  useEffect(() => {
    contactResolutionTokenRef.current += 1
    contactConsentTokenRef.current += 1
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
    setContactConsentAction({ kind: "idle" })
    setNotifications({ kind: "loading" })
    setRetention({ kind: "loading" })
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
      void Promise.all([notificationsApi.getSettings(scope), retentionApi.list(scope)])
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
  }, [api, notificationsApi, retentionApi, role, scope, activePrincipal])

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
    const requestToken = contactResolutionTokenRef.current + 1
    contactResolutionTokenRef.current = requestToken
    setContactAction({ kind: "submitting" })
    const result = await api.resolveContact(selectedScope, sessionId, recipient)
    if (
      !requestTokenIsCurrent(contactResolutionTokenRef.current, requestToken) ||
      selectedScope !== scopeRef.current
    )
      return
    setContactAction(actionFromResult(result))
  }
  const setContactConsent = async (
    selectedScope: AccountScope,
    sessionId: string,
    contactId: string,
    input: { readonly consentGranted: boolean; optedOut: boolean },
  ): Promise<void> => {
    const requestToken = contactConsentTokenRef.current + 1
    contactConsentTokenRef.current = requestToken
    setContactConsentAction({ kind: "submitting" })
    const result = await api.setContactConsent(selectedScope, sessionId, contactId, input)
    if (
      !requestTokenIsCurrent(contactConsentTokenRef.current, requestToken) ||
      selectedScope !== scopeRef.current
    )
      return
    setContactConsentAction(actionFromResult(result))
  }
  const previewPurge = async (
    selectedScope: AccountScope,
    category: RetentionCategory,
  ): Promise<void> => {
    setPurgePreview({ kind: "submitting" })
    setPurgePreview(actionFromResult(await retentionApi.preview(selectedScope, category)))
  }
  const purge = async (
    selectedScope: AccountScope,
    input: Omit<RetentionPurgeInput, "confirmed">,
  ): Promise<void> => {
    setPurgeAction({ kind: "submitting" })
    setPurgeAction(
      actionFromResult(await retentionApi.purge(selectedScope, { ...input, confirmed: true })),
    )
  }
  const refreshSessions = async (request: DashboardScopeRequest): Promise<void> => {
    const result = await api.getSessions(request.scope)
    if (scopeRequestIsCurrent(scopeRef.current, scopeGenerationRef.current, request))
      setSessions(resourceFromResult(result))
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
    contactConsentAction,
    purgePreview,
    purgeAction,
    clearPurgePreview,
    setActiveView,
    setScope: setDashboardScope,
    currentScopeRequest: { scope, generation: scopeGenerationRef.current },
    refreshSessions,
    toggleNav: () => setIsNavOpen((current) => !current),
    logout,
    send,
    schedule,
    resolveContact,
    setContactConsent,
    previewPurge,
    purge,
  }
}
