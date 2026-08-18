import { useEffect, useMemo, useState } from "react"

import type { SessionView } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"
import {
  createDashboardScheduleApi,
  type ScheduleEditInput,
  type ScheduleView,
} from "./dashboard-schedule-api"
import {
  type ActionState,
  actionFromResult,
  type ResourceState,
  resourceFromResult,
} from "./dashboard-state"

export type DashboardScheduleController = Readonly<{
  schedules: ResourceState<readonly ScheduleView[]>
  selectedScheduleId: string
  detail: ResourceState<ScheduleView | undefined>
  editAction: ActionState<ScheduleView>
  cancelAction: ActionState<ScheduleView>
  selectSchedule: (jobId: string) => void
  editSchedule: (
    scope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ) => Promise<void>
  cancelSchedule: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
}>

export function useDashboardScheduleController(
  scope: AccountScope,
  sessions: ResourceState<readonly SessionView[]>,
): DashboardScheduleController {
  const api = useMemo(() => createDashboardScheduleApi(import.meta.env.VITE_API_BASE_URL), [])
  const [schedules, setSchedules] = useState<ResourceState<readonly ScheduleView[]>>({
    kind: "loading",
  })
  const [selectedScheduleId, setSelectedScheduleId] = useState("")
  const [detail, setDetail] = useState<ResourceState<ScheduleView | undefined>>({ kind: "loading" })
  const [editAction, setEditAction] = useState<ActionState<ScheduleView>>({ kind: "idle" })
  const [cancelAction, setCancelAction] = useState<ActionState<ScheduleView>>({ kind: "idle" })
  const selectedSessionId = sessions.kind === "ready" ? sessions.data[0]?.id : undefined

  useEffect(() => {
    let isCurrent = true
    setSelectedScheduleId("")
    setDetail({ kind: "loading" })
    setEditAction({ kind: "idle" })
    setCancelAction({ kind: "idle" })
    if (!selectedSessionId) {
      setSchedules(sessions.kind === "ready" ? { kind: "ready", data: [] } : { kind: "loading" })
      return () => {
        isCurrent = false
      }
    }
    setSchedules({ kind: "loading" })
    void api.list(scope, selectedSessionId).then((result) => {
      if (!isCurrent) return
      setSchedules(resourceFromResult(result))
      if (result.kind === "ready") {
        const first = result.data[0]
        if (first) {
          setSelectedScheduleId(first.id)
          setDetail({ kind: "loading" })
          void api.get(scope, selectedSessionId, first.id).then((detailResult) => {
            if (isCurrent) setDetail(resourceFromResult(detailResult))
          })
        } else {
          setDetail({ kind: "ready", data: undefined })
        }
      }
    })
    return () => {
      isCurrent = false
    }
  }, [api, scope, selectedSessionId, sessions.kind])

  const selectSchedule = (jobId: string): void => {
    setSelectedScheduleId(jobId)
    if (!selectedSessionId) return
    setDetail({ kind: "loading" })
    void api
      .get(scope, selectedSessionId, jobId)
      .then((result) => setDetail(resourceFromResult(result)))
  }

  const editSchedule = async (
    selectedScope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ): Promise<void> => {
    setEditAction({ kind: "submitting" })
    setEditAction(actionFromResult(await api.edit(selectedScope, sessionId, jobId, input)))
  }

  const cancelSchedule = async (
    selectedScope: AccountScope,
    sessionId: string,
    jobId: string,
  ): Promise<void> => {
    setCancelAction({ kind: "submitting" })
    setCancelAction(actionFromResult(await api.cancel(selectedScope, sessionId, jobId)))
  }

  return {
    schedules,
    selectedScheduleId,
    detail,
    editAction,
    cancelAction,
    selectSchedule,
    editSchedule,
    cancelSchedule,
  }
}
