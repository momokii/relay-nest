import { useEffect, useMemo, useRef, useState } from "react"

import type { SessionView } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"
import {
  createDashboardSessionApi,
  type SessionCreateInput,
  type SessionLifecycleAction,
  type SessionStatusHistory,
} from "./dashboard-session-api"
import { type ActionState, actionFromResult } from "./dashboard-state"

export type DashboardSessionController = Readonly<{
  sessionCreateAction: ActionState<SessionView>
  sessionLifecycleAction: ActionState<SessionView | null>
  sessionHistoryAction: ActionState<readonly SessionStatusHistory[]>
  createSession: (scope: AccountScope, input: SessionCreateInput) => Promise<boolean>
  lifecycleSession: (
    scope: AccountScope,
    sessionId: string,
    action: SessionLifecycleAction,
    confirmed: boolean,
  ) => Promise<void>
  loadSessionHistory: (scope: AccountScope, sessionId: string) => Promise<void>
}>

export function useDashboardSessionController(scope: AccountScope): DashboardSessionController {
  const api = useMemo(() => createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL), [])
  const [sessionCreateAction, setSessionCreateAction] = useState<ActionState<SessionView>>({
    kind: "idle",
  })
  const [sessionLifecycleAction, setSessionLifecycleAction] = useState<
    ActionState<SessionView | null>
  >({ kind: "idle" })
  const [sessionHistoryAction, setSessionHistoryAction] = useState<
    ActionState<readonly SessionStatusHistory[]>
  >({ kind: "idle" })
  const previousScope = useRef(scope)

  useEffect(() => {
    if (previousScope.current === scope) return
    previousScope.current = scope
    setSessionCreateAction({ kind: "idle" })
    setSessionLifecycleAction({ kind: "idle" })
    setSessionHistoryAction({ kind: "idle" })
  }, [scope])

  const createSession = async (
    scope: AccountScope,
    input: SessionCreateInput,
  ): Promise<boolean> => {
    setSessionCreateAction({ kind: "submitting" })
    const result = await api.create(scope, input)
    setSessionCreateAction(actionFromResult(result))
    return result.kind === "ready"
  }

  const lifecycleSession = async (
    scope: AccountScope,
    sessionId: string,
    action: SessionLifecycleAction,
    confirmed: boolean,
  ): Promise<void> => {
    setSessionLifecycleAction({ kind: "submitting" })
    setSessionLifecycleAction(
      actionFromResult(await api.lifecycle(scope, sessionId, action, confirmed)),
    )
  }
  const loadSessionHistory = async (scope: AccountScope, sessionId: string): Promise<void> => {
    setSessionHistoryAction({ kind: "submitting" })
    setSessionHistoryAction(actionFromResult(await api.getStatusHistory(scope, sessionId)))
  }

  return {
    sessionCreateAction,
    sessionLifecycleAction,
    sessionHistoryAction,
    createSession,
    lifecycleSession,
    loadSessionHistory,
  }
}
