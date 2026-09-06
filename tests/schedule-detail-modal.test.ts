import { type ComponentProps, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ScheduleDeleteConfirm } from "../apps/web/src/components/schedule-delete-confirm"
import { ScheduleDetailModal } from "../apps/web/src/components/schedule-detail-modal"
import { ScheduleHistoryPanel } from "../apps/web/src/components/schedule-history-panel"
import type { ScheduleRemoval, ScheduleView } from "../apps/web/src/dashboard-schedule-api"
import type { SentHistoryDetail, SentHistoryState } from "../apps/web/src/dashboard-session-api"
import type { ActionState } from "../apps/web/src/dashboard-state"

const IDLE_EDIT: ActionState<ScheduleView> = { kind: "idle" }
const IDLE_CANCEL: ActionState<ScheduleView> = { kind: "idle" }
const IDLE_DELETE: ActionState<ScheduleRemoval> = { kind: "idle" }
const NO_OP = () => Promise.resolve()
const NO_OP_VOID = () => {}

function detailFor(state: SentHistoryState): SentHistoryDetail {
  return {
    id: "job-1",
    sessionId: "session-1",
    scope: "personal",
    recipientPhone: "+628123456789",
    snippet80: "Hello there",
    scheduledFor: "2026-09-05T10:00:00.000Z",
    timezone: "Asia/Jakarta",
    createdAt: "2026-09-04T08:00:00.000Z",
    updatedAt: "2026-09-04T08:00:00.000Z",
    state,
    attempts: 1,
    nextAttemptAt: null,
    failureCode: null,
    recoveryCode: null,
    providerMessageId: null,
    message: "Full message body",
  }
}

function renderModal(state: SentHistoryState): string {
  return renderToStaticMarkup(
    createElement(ScheduleDetailModal, {
      detail: { kind: "ready", data: detailFor(state) },
      editAction: IDLE_EDIT,
      cancelAction: IDLE_CANCEL,
      deleteAction: IDLE_DELETE,
      onEdit: NO_OP,
      onCancel: NO_OP,
      onDelete: NO_OP,
      onClose: NO_OP_VOID,
    }),
  )
}

describe("ScheduleDetailModal", () => {
  it("shows state-appropriate actions", () => {
    // Given every canonical schedule state
    // When the detail modal renders for that state
    // Then mutable states offer Save + Cancel, terminal states offer Delete,
    // and in-flight attempting offers neither
    for (const state of ["scheduled", "queued"] as const) {
      const markup = renderModal(state)
      expect(markup).toContain("Save schedule")
      expect(markup).toContain("Cancel schedule")
      expect(markup).not.toContain('aria-label="Delete schedule"')
    }
    for (const state of ["submitted", "acknowledged", "failed", "unknown", "cancelled"] as const) {
      const markup = renderModal(state)
      expect(markup).toContain('aria-label="Delete schedule"')
      expect(markup).not.toContain("Save schedule")
      expect(markup).not.toContain("Cancel schedule")
    }
    const attempting = renderModal("attempting")
    expect(attempting).not.toContain("Save schedule")
    expect(attempting).not.toContain("Cancel schedule")
    expect(attempting).not.toContain('aria-label="Delete schedule"')
  })

  it("keeps delete behind a confirmation dialog", () => {
    // Given a terminal-state schedule
    // When the modal renders before confirmation
    // Then only the Delete trigger exists and no confirm dialog is present
    const markup = renderModal("failed")
    expect(markup).toContain('aria-label="Delete schedule"')
    expect(markup).not.toContain("Confirm delete schedule")

    // When the confirm dialog renders
    // Then it warns about irreversibility and offers Cancel plus Delete
    const confirm = renderToStaticMarkup(
      createElement(ScheduleDeleteConfirm, {
        job: detailFor("failed"),
        busy: false,
        onConfirm: NO_OP_VOID,
        onDismiss: NO_OP_VOID,
      }),
    )
    expect(confirm).toContain('aria-label="Confirm delete schedule job-1"')
    expect(confirm).toContain("cannot be undone")
    expect(confirm).toContain("Cancel")
    expect(confirm).toContain("Delete")
  })

  it("surfaces detail fields for the selected job", () => {
    // Given a ready detail record
    // When the modal renders
    // Then recipient, full message, schedule time with timezone, attempts, and
    // failure context are visible inside an accessible dialog
    const failing = {
      ...detailFor("failed"),
      nextAttemptAt: "2026-09-05T11:00:00.000Z",
      failureCode: "WAHA_TIMEOUT",
      recoveryCode: "RETRY_SCHEDULED",
    }
    const markup = renderToStaticMarkup(
      createElement(ScheduleDetailModal, {
        detail: { kind: "ready", data: failing },
        editAction: IDLE_EDIT,
        cancelAction: IDLE_CANCEL,
        deleteAction: IDLE_DELETE,
        onEdit: NO_OP,
        onCancel: NO_OP,
        onDelete: NO_OP,
        onClose: NO_OP_VOID,
      }),
    )
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('aria-label="Schedule detail"')
    expect(markup).toContain("+628123456789")
    expect(markup).toContain("Full message body")
    expect(markup).toContain("Asia/Jakarta")
    expect(markup).toContain("WAHA_TIMEOUT")
    expect(markup).toContain("RETRY_SCHEDULED")
  })
})

describe("ScheduleHistoryPanel", () => {
  function panelProps(openJobId: string): ComponentProps<typeof ScheduleHistoryPanel> {
    return {
      scope: "personal",
      history: {
        kind: "ready",
        data: {
          items: [detailFor("scheduled"), { ...detailFor("submitted"), id: "job-2" }],
          page: 1,
          pageSize: 20,
          hasMore: true,
        },
      },
      page: 1,
      openJobId,
      detail: { kind: "ready", data: detailFor("scheduled") },
      editAction: IDLE_EDIT,
      cancelAction: IDLE_CANCEL,
      deleteAction: IDLE_DELETE,
      loadPage: NO_OP_VOID,
      onOpenJob: NO_OP_VOID,
      onCloseJob: NO_OP_VOID,
      onEdit: NO_OP,
      onCancel: NO_OP,
      onDelete: NO_OP,
    }
  }

  it("opens the detail dialog only when a job is open", () => {
    // Given the combined history table
    // When no job is open
    // Then no dialog renders
    const closed = renderToStaticMarkup(createElement(ScheduleHistoryPanel, panelProps("")))
    expect(closed).toContain('aria-label="personal schedule history"')
    expect(closed).not.toContain('role="dialog"')

    // When a row is opened
    // Then the detail dialog renders with that job's data
    const open = renderToStaticMarkup(createElement(ScheduleHistoryPanel, panelProps("job-1")))
    expect(open).toContain('aria-label="Schedule detail"')
    expect(open).toContain("+628123456789")
  })

  it("renders combined rows with details actions and pagination", () => {
    // Given a ready history page with two records
    // When the panel renders
    // Then each row exposes a Details action and pagination is available
    const markup = renderToStaticMarkup(createElement(ScheduleHistoryPanel, panelProps("")))
    expect(markup).toContain('aria-label="View details for job job-1"')
    expect(markup).toContain('aria-label="View details for job job-2"')
    expect(markup).toContain("Previous")
    expect(markup).toContain("Next")
    expect(markup).not.toContain('aria-label="business schedule history"')
  })
})
