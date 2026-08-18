import { useMemo, useState } from "react"

import type { SessionView } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"
import {
  createDashboardSessionApi,
  type SessionLifecycleAction,
  type SessionStatusHistory,
} from "./dashboard-session-api"
import { type ActionState, actionFromResult } from "./dashboard-state"

export type DashboardSessionController = Readonly<{
  sessionLifecycleAction: ActionState<SessionView | null>
  sessionHistoryAction: ActionState<readonly SessionStatusHistory[]>
  lifecycleSession: (
    scope: AccountScope,
    sessionId: string,
    action: SessionLifecycleAction,
    confirmed: boolean,
  ) => Promise<void>
  loadSessionHistory: (scope: AccountScope, sessionId: string) => Promise<void>
}>

export function useDashboardSessionController(): DashboardSessionController {
  const api = useMemo(() => createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL), [])
  const [sessionLifecycleAction, setSessionLifecycleAction] = useState<
    ActionState<SessionView | null>
  >({ kind: "idle" })
  const [sessionHistoryAction, setSessionHistoryAction] = useState<
    ActionState<readonly SessionStatusHistory[]>
  >({ kind: "idle" })

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

  return { sessionLifecycleAction, sessionHistoryAction, lifecycleSession, loadSessionHistory }
}
