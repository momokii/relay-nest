import { type ComponentProps, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ScheduleDetailModal } from "../apps/web/src/components/schedule-detail-modal"
import { ScheduleHistoryPanel } from "../apps/web/src/components/schedule-history-panel"
import { formatScheduleDate } from "../apps/web/src/components/view-support"
import type { ScheduleRemoval, ScheduleView } from "../apps/web/src/dashboard-schedule-api"
import type { SentHistoryDetail } from "../apps/web/src/dashboard-session-api"
import type { ActionState } from "../apps/web/src/dashboard-state"

const IDLE_EDIT: ActionState<ScheduleView> = { kind: "idle" }
const IDLE_CANCEL: ActionState<ScheduleView> = { kind: "idle" }
const IDLE_DELETE: ActionState<ScheduleRemoval> = { kind: "idle" }
const NO_OP = () => Promise.resolve()
const NO_OP_VOID = () => {}

const PERSISTED_INSTANT = "2026-09-06T10:38:00.000Z"

function detailFor(state: SentHistoryState): SentHistoryDetail {
  return {
    id: "job-1",
    sessionId: "session-1",
    scope: "personal",
    recipientPhone: "+628123456789",
    snippet80: "Hello there",
    scheduledFor: PERSISTED_INSTANT,
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

describe("schedule timezone display", () => {
  it("formats a persisted schedule instant in its persisted timezone", () => {
    // Given the persisted instant for 2026-09-06T17:38 Asia/Jakarta
    // When the row time is formatted for Asia/Jakarta and for UTC
    // Then Asia/Jakarta shows 17:38 while UTC shows 10:38
    expect(formatScheduleDate(PERSISTED_INSTANT, "Asia/Jakarta")).toBe("06/09/2026, 17:38")
    expect(formatScheduleDate(PERSISTED_INSTANT, "UTC")).toBe("06/09/2026, 10:38")
  })

  it("renders the detail modal time and edit input in the persisted timezone", () => {
    // Given a scheduled job persisted as 2026-09-06T10:38:00.000Z Asia/Jakarta
    // When the detail modal renders
    // Then the wall time shows 17:38 and the edit input is a timezone-local datetime-local field
    const markup = renderToStaticMarkup(
      createElement(ScheduleDetailModal, {
        detail: { kind: "ready", data: detailFor("scheduled") },
        editAction: IDLE_EDIT,
        cancelAction: IDLE_CANCEL,
        deleteAction: IDLE_DELETE,
        onEdit: NO_OP,
        onCancel: NO_OP,
        onDelete: NO_OP,
        onClose: NO_OP_VOID,
      }),
    )
    expect(markup).toContain("06/09/2026, 17:38")
    expect(markup).not.toContain("06/09/2026, 10:38")
    expect(markup).toContain('type="datetime-local"')
    expect(markup).toContain('value="2026-09-06T17:38"')
  })

  it("renders schedule history rows in each row's persisted timezone", () => {
    // Given a ready history page with one Asia/Jakarta job
    // When the panel renders
    // Then the When cell shows 17:38 next to the row's timezone
    const props: ComponentProps<typeof ScheduleHistoryPanel> = {
      scope: "personal",
      history: {
        kind: "ready",
        data: {
          items: [detailFor("scheduled")],
          page: 1,
          pageSize: 20,
          hasMore: false,
        },
      },
      page: 1,
      openJobId: "",
      detail: { kind: "ready", data: undefined },
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
    const markup = renderToStaticMarkup(createElement(ScheduleHistoryPanel, props))
    expect(markup).toContain("06/09/2026, 17:38")
    expect(markup).toContain("Asia/Jakarta")
  })
})
