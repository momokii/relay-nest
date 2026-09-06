import { useEffect, useMemo, useRef, useState } from "react"

import type { AccountScope } from "./dashboard-model"
import {
  createDashboardScheduleApi,
  type ScheduleEditInput,
  type ScheduleRemoval,
  type ScheduleView,
} from "./dashboard-schedule-api"
import {
  createDashboardSessionApi,
  type SentHistoryDetail,
  type SentHistoryItem,
  type SentHistoryOrigin,
  type SentHistoryPage,
  type SentHistoryState,
} from "./dashboard-session-api"
import {
  type ActionState,
  actionFromResult,
  type ResourceState,
  resourceFromResult,
} from "./dashboard-state"

export type ScheduleRowActions = Readonly<{
  canCancel: boolean
  canDelete: boolean
}>

const ROW_ACTIONS: Record<SentHistoryState, ScheduleRowActions> = {
  scheduled: { canCancel: true, canDelete: false },
  queued: { canCancel: true, canDelete: false },
  attempting: { canCancel: false, canDelete: false },
  submitted: { canCancel: false, canDelete: true },
  acknowledged: { canCancel: false, canDelete: true },
  failed: { canCancel: false, canDelete: true },
  unknown: { canCancel: false, canDelete: true },
  cancelled: { canCancel: false, canDelete: true },
}

export function scheduleRowActions(state: SentHistoryState): ScheduleRowActions {
  return ROW_ACTIONS[state]
}

export type DashboardScheduleHistoryController = Readonly<{
  history: ResourceState<SentHistoryPage>
  page: number
  pageSize: number
  selectedJobId: string
  detail: ResourceState<SentHistoryDetail | undefined>
  editAction: ActionState<ScheduleView>
  cancelAction: ActionState<ScheduleView>
  deleteAction: ActionState<ScheduleRemoval>
  q: string
  stateFilter: SentHistoryState | ""
  from: string
  to: string
  setQ: (value: string) => void
  setStateFilter: (value: SentHistoryState | "") => void
  setFrom: (value: string) => void
  setTo: (value: string) => void
  setPageSize: (value: number) => void
  loadPage: (page: number) => void
  refresh: () => void
  selectJob: (jobId: string) => void
  editJob: (
    scope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ) => Promise<void>
  cancelJob: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
  deleteJob: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
}>

function withSchedule<T extends SentHistoryItem>(item: T, updated: ScheduleView): T {
  return {
    ...item,
    scheduledFor: updated.scheduledFor,
    timezone: updated.timezone,
    state: updated.state,
    attempts: updated.attempts,
    nextAttemptAt: updated.nextAttemptAt,
    providerMessageId: updated.providerMessageId ?? item.providerMessageId,
    failureCode: updated.failureCode,
    recoveryCode: updated.recoveryCode,
  }
}

export function useDashboardScheduleHistoryController(
  scope: AccountScope,
  origin: SentHistoryOrigin,
): DashboardScheduleHistoryController {
  const sessionApi = useMemo(() => createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL), [])
  const scheduleApi = useMemo(
    () => createDashboardScheduleApi(import.meta.env.VITE_API_BASE_URL),
    [],
  )
  const [history, setHistory] = useState<ResourceState<SentHistoryPage>>({ kind: "loading" })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedJobId, setSelectedJobId] = useState("")
  const [detail, setDetail] = useState<ResourceState<SentHistoryDetail | undefined>>({
    kind: "loading",
  })
  const [editAction, setEditAction] = useState<ActionState<ScheduleView>>({ kind: "idle" })
  const [cancelAction, setCancelAction] = useState<ActionState<ScheduleView>>({ kind: "idle" })
  const [deleteAction, setDeleteAction] = useState<ActionState<ScheduleRemoval>>({ kind: "idle" })
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [stateFilter, setStateFilter] = useState<SentHistoryState | "">("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [refreshTick, setRefreshTick] = useState(0)
  const historyRequestId = useRef(0)
  const detailRequestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 3000)
    return () => clearTimeout(timer)
  }, [q])

  useEffect(() => {
    setPage(1)
  }, [debouncedQ, stateFilter, from, to, pageSize, scope])

  // Query identity for the history fetch. refreshTick is part of the key so a
  // submit-triggered refresh re-runs the effect even when no filter changed.
  const historyQuery = useMemo(
    () => ({
      page,
      pageSize,
      q: debouncedQ,
      state: stateFilter,
      from,
      to,
      scope,
      origin,
      refreshTick,
    }),
    [page, pageSize, debouncedQ, stateFilter, from, to, scope, origin, refreshTick],
  )

  useEffect(() => {
    const requestId = ++historyRequestId.current
    detailRequestId.current += 1
    setSelectedJobId("")
    setDetail({ kind: "loading" })
    setEditAction({ kind: "idle" })
    setCancelAction({ kind: "idle" })
    setDeleteAction({ kind: "idle" })
    setHistory({ kind: "loading" })
    const filters: {
      q?: string
      state?: SentHistoryState
      from?: string
      to?: string
      origin: SentHistoryOrigin
    } = { origin: historyQuery.origin }
    if (historyQuery.q) filters.q = historyQuery.q
    if (historyQuery.state) filters.state = historyQuery.state
    if (historyQuery.from) filters.from = historyQuery.from
    if (historyQuery.to) filters.to = historyQuery.to
    void sessionApi
      .sentHistory(historyQuery.scope, historyQuery.page, historyQuery.pageSize, filters)
      .then((result) => {
        if (requestId !== historyRequestId.current) return
        setHistory(resourceFromResult(result))
        if (result.kind !== "ready") return
        const first = result.data.items[0]
        if (!first) {
          setDetail({ kind: "ready", data: undefined })
          return
        }
        setSelectedJobId(first.id)
        setDetail({ kind: "loading" })
        const detailId = ++detailRequestId.current
        void sessionApi.sentHistoryDetail(historyQuery.scope, first.id).then((detailResult) => {
          if (detailId === detailRequestId.current) setDetail(resourceFromResult(detailResult))
        })
      })
  }, [historyQuery, sessionApi])

  const loadPage = (nextPage: number): void => {
    historyRequestId.current += 1
    setPage(nextPage)
  }

  const refresh = (): void => {
    historyRequestId.current += 1
    setPage(1)
    setRefreshTick((tick) => tick + 1)
  }

  const selectJob = (jobId: string): void => {
    setSelectedJobId(jobId)
    setDetail({ kind: "loading" })
    setEditAction({ kind: "idle" })
    setCancelAction({ kind: "idle" })
    setDeleteAction({ kind: "idle" })
    const requestId = ++detailRequestId.current
    void sessionApi.sentHistoryDetail(scope, jobId).then((result) => {
      if (requestId === detailRequestId.current) setDetail(resourceFromResult(result))
    })
  }

  const reconcileSchedule = (updated: ScheduleView): void => {
    setHistory((current) => {
      if (current.kind !== "ready") return current
      return {
        kind: "ready",
        data: {
          ...current.data,
          items: current.data.items.map((item) =>
            item.id === updated.id ? withSchedule(item, updated) : item,
          ),
        },
      }
    })
    setDetail((current) => {
      if (current.kind !== "ready" || current.data?.id !== updated.id) return current
      return { kind: "ready", data: withSchedule(current.data, updated) }
    })
  }

  const dropJob = (jobId: string): void => {
    setHistory((current) => {
      if (current.kind !== "ready") return current
      return {
        kind: "ready",
        data: { ...current.data, items: current.data.items.filter((item) => item.id !== jobId) },
      }
    })
    setDetail((current) =>
      current.kind === "ready" && current.data?.id === jobId
        ? { kind: "ready", data: undefined }
        : current,
    )
  }

  const editJob = async (
    selectedScope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ): Promise<void> => {
    setEditAction({ kind: "submitting" })
    const result = await scheduleApi.edit(selectedScope, sessionId, jobId, input)
    setEditAction(actionFromResult(result))
    if (result.kind === "ready") reconcileSchedule(result.data)
  }

  const cancelJob = async (
    selectedScope: AccountScope,
    sessionId: string,
    jobId: string,
  ): Promise<void> => {
    setCancelAction({ kind: "submitting" })
    const result = await scheduleApi.cancel(selectedScope, sessionId, jobId)
    setCancelAction(actionFromResult(result))
    if (result.kind === "ready") reconcileSchedule(result.data)
  }

  const deleteJob = async (
    selectedScope: AccountScope,
    sessionId: string,
    jobId: string,
  ): Promise<void> => {
    setDeleteAction({ kind: "submitting" })
    const result = await scheduleApi.remove(selectedScope, sessionId, jobId)
    setDeleteAction(actionFromResult(result))
    if (result.kind === "ready") dropJob(result.data.id)
  }

  return {
    history,
    page,
    pageSize,
    selectedJobId,
    detail,
    editAction,
    cancelAction,
    deleteAction,
    q,
    stateFilter,
    from,
    to,
    setQ,
    setStateFilter,
    setFrom,
    setTo,
    setPageSize,
    loadPage,
    refresh,
    selectJob,
    editJob,
    cancelJob,
    deleteJob,
  }
}
