import { useEffect, useMemo, useRef, useState } from "react"

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
  selectedSessionId: string
  selectedScheduleId: string
  detail: ResourceState<ScheduleView | undefined>
  editAction: ActionState<ScheduleView>
  cancelAction: ActionState<ScheduleView>
  selectSession: (sessionId: string) => void
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
  const [selectedSessionId, setSelectedSessionId] = useState("")
  const [selectedScheduleId, setSelectedScheduleId] = useState("")
  const [detail, setDetail] = useState<ResourceState<ScheduleView | undefined>>({ kind: "loading" })
  const [editAction, setEditAction] = useState<ActionState<ScheduleView>>({ kind: "idle" })
  const [cancelAction, setCancelAction] = useState<ActionState<ScheduleView>>({ kind: "idle" })
  const detailRequestId = useRef(0)
  const availableSessionIds =
    sessions.kind === "ready" ? sessions.data.map((session) => session.id).join(",") : ""
  const firstSessionId = sessions.kind === "ready" ? (sessions.data[0]?.id ?? "") : ""

  useEffect(() => {
    if (sessions.kind !== "ready") {
      setSelectedSessionId("")
      return
    }
    setSelectedSessionId((current) =>
      availableSessionIds.split(",").includes(current) ? current : firstSessionId,
    )
  }, [availableSessionIds, firstSessionId, sessions.kind])

  useEffect(() => {
    let isCurrent = true
    detailRequestId.current += 1
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
          const requestId = ++detailRequestId.current
          void api.get(scope, selectedSessionId, first.id).then((detailResult) => {
            if (isCurrent && requestId === detailRequestId.current)
              setDetail(resourceFromResult(detailResult))
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

  const selectSession = (sessionId: string): void => {
    if (sessions.kind !== "ready") return
    if (sessions.data.some((session) => session.id === sessionId)) {
      detailRequestId.current += 1
      setSelectedSessionId(sessionId)
    }
  }

  const selectSchedule = (jobId: string): void => {
    setSelectedScheduleId(jobId)
    if (!selectedSessionId) return
    setDetail({ kind: "loading" })
    const requestId = ++detailRequestId.current
    void api.get(scope, selectedSessionId, jobId).then((result) => {
      if (requestId === detailRequestId.current) setDetail(resourceFromResult(result))
    })
  }

  const editSchedule = async (
    selectedScope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ): Promise<void> => {
    setEditAction({ kind: "submitting" })
    const result = await api.edit(selectedScope, sessionId, jobId, input)
    setEditAction(actionFromResult(result))
    if (result.kind === "ready") reconcileSchedule(result.data)
  }

  const cancelSchedule = async (
    selectedScope: AccountScope,
    sessionId: string,
    jobId: string,
  ): Promise<void> => {
    setCancelAction({ kind: "submitting" })
    const result = await api.cancel(selectedScope, sessionId, jobId)
    setCancelAction(actionFromResult(result))
    if (result.kind === "ready") reconcileSchedule(result.data)
  }

  const reconcileSchedule = (updated: ScheduleView): void => {
    setSchedules((current) => {
      if (current.kind !== "ready") return current
      return {
        kind: "ready",
        data: current.data.map((schedule) => (schedule.id === updated.id ? updated : schedule)),
      }
    })
    setDetail((current) => {
      if (current.kind !== "ready" || current.data?.id !== updated.id) return current
      return { kind: "ready", data: updated }
    })
  }

  return {
    schedules,
    selectedSessionId,
    selectedScheduleId,
    detail,
    editAction,
    cancelAction,
    selectSession,
    selectSchedule,
    editSchedule,
    cancelSchedule,
  }
}
