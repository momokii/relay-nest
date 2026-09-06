import { type ComponentProps, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ScheduleHistoryPanel } from "../apps/web/src/components/schedule-history-panel"
import type { ScheduleRemoval, ScheduleView } from "../apps/web/src/dashboard-schedule-api"
import type { SentHistoryDetail } from "../apps/web/src/dashboard-session-api"
import type { ActionState } from "../apps/web/src/dashboard-state"

const IDLE_EDIT: ActionState<ScheduleView> = { kind: "idle" }
const IDLE_CANCEL: ActionState<ScheduleView> = { kind: "idle" }
const IDLE_DELETE: ActionState<ScheduleRemoval> = { kind: "idle" }
const NO_OP = () => Promise.resolve()
const NO_OP_VOID = () => {}

const JOB_REFERENCE = "685d2eaf-8649-4ec7-85e9-69a12e7a5722"

function detailFor(): SentHistoryDetail {
  return {
    id: JOB_REFERENCE,
    sessionId: "session-1",
    scope: "personal",
    recipientPhone: "+628123456789",
    snippet80: "Hello there",
    scheduledFor: "2026-09-06T10:38:00.000Z",
    timezone: "Asia/Jakarta",
    createdAt: "2026-09-04T08:00:00.000Z",
    updatedAt: "2026-09-04T08:00:00.000Z",
    state: "scheduled",
    attempts: 0,
    nextAttemptAt: null,
    failureCode: null,
    recoveryCode: null,
    providerMessageId: null,
    message: "Full message body",
  }
}

function panelProps(): ComponentProps<typeof ScheduleHistoryPanel> {
  return {
    scope: "personal",
    origin: "scheduled",
    history: {
      kind: "ready",
      data: { items: [detailFor()], page: 1, pageSize: 20, hasMore: false },
    },
    page: 1,
    pageSize: 20,
    q: "",
    stateFilter: "",
    from: "",
    to: "",
    openJobId: "",
    detail: { kind: "ready", data: undefined },
    editAction: IDLE_EDIT,
    cancelAction: IDLE_CANCEL,
    deleteAction: IDLE_DELETE,
    loadPage: NO_OP_VOID,
    setPageSize: NO_OP_VOID,
    setQ: NO_OP_VOID,
    setStateFilter: NO_OP_VOID,
    setFrom: NO_OP_VOID,
    setTo: NO_OP_VOID,
    onOpenJob: NO_OP_VOID,
    onCloseJob: NO_OP_VOID,
    onEdit: NO_OP,
    onCancel: NO_OP,
    onDelete: NO_OP,
  }
}

describe("schedule history reference column", () => {
  it("shows the job reference in each row with the full id on hover", () => {
    // Given a ready history page containing one scheduled job
    const props = panelProps()

    // When the panel renders
    const markup = renderToStaticMarkup(createElement(ScheduleHistoryPanel, props))

    // Then the reference header, searchable placeholder, and hoverable full id are present
    expect(markup).toContain("Reference")
    expect(markup).toContain(`title="${JOB_REFERENCE}"`)
    expect(markup).toContain("685d2eaf-8649-4ec7-85…")
    expect(markup).toContain("Message, recipient, or reference…")
  })
})
