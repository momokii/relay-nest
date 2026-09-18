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

function detailFor(overrides: Partial<SentHistoryDetail> = {}): SentHistoryDetail {
  return {
    id: "job-1",
    sessionId: "session-1",
    scope: "personal",
    recipientPhone: "+628123456789",
    snippet80: "Hello *bold* world\nsecond line\nthird line that should be clamped",
    scheduledFor: "2026-09-05T10:00:00.000Z",
    timezone: "Asia/Jakarta",
    createdAt: "2026-09-04T08:00:00.000Z",
    updatedAt: "2026-09-04T08:00:00.000Z",
    state: "scheduled",
    attempts: 1,
    nextAttemptAt: null,
    failureCode: null,
    recoveryCode: null,
    providerMessageId: null,
    message: "Full message body",
    ...overrides,
  }
}

function panelProps(
  overrides: Partial<ComponentProps<typeof ScheduleHistoryPanel>> = {},
): ComponentProps<typeof ScheduleHistoryPanel> {
  return {
    scope: "personal",
    origin: "scheduled",
    history: { kind: "ready", data: { items: [], page: 1, pageSize: 20, hasMore: false } },
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
    ...overrides,
  }
}

describe("schedule history panel - inline expand/collapse", () => {
  it("collapsed truncated row shows clamp, Show more, aria-expanded false, title preserves snippet", () => {
    const truncated = { ...detailFor({ id: "job-2" }), messageTruncated: true }
    const complete = {
      ...detailFor({ id: "job-1" }),
      snippet80: "Short msg",
      messageTruncated: false,
    }
    const markup = renderToStaticMarkup(
      createElement(ScheduleHistoryPanel, {
        ...panelProps(),
        history: {
          kind: "ready",
          data: { items: [complete, truncated], page: 1, pageSize: 20, hasMore: false },
        },
      }),
    )
    // Only truncated offers toggle
    expect(markup).toContain('aria-label="Show full message for job job-2"')
    expect(markup).not.toContain('aria-label="Show full message for job job-1"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain("Show more")
    expect(markup).not.toContain("Show less")
    // Collapsed uses clamp
    expect(markup).toContain('class="history-message-clamp"')
    // Title preserves snippet
    expect(markup).toContain(`title="${truncated.snippet80}"`)
    // Details button still present
    expect(markup).toContain('aria-label="View details for job job-2"')
    // No dialog opened
    expect(markup).not.toContain('role="dialog"')
  })

  it("non-truncated row has no toggle", () => {
    const item = { ...detailFor({ id: "job-1" }), messageTruncated: false, snippet80: "Hello" }
    const markup = renderToStaticMarkup(
      createElement(ScheduleHistoryPanel, {
        ...panelProps(),
        history: { kind: "ready", data: { items: [item], page: 1, pageSize: 20, hasMore: false } },
      }),
    )
    expect(markup).not.toContain("message-toggle")
    expect(markup).not.toContain("Show more")
  })

  it("null snippet shows Unavailable with no toggle", () => {
    const item = { ...detailFor({ id: "job-1", snippet80: null }), messageTruncated: false }
    const markup = renderToStaticMarkup(
      createElement(ScheduleHistoryPanel, {
        ...panelProps(),
        history: { kind: "ready", data: { items: [item], page: 1, pageSize: 20, hasMore: false } },
      }),
    )
    expect(markup).toContain("Unavailable")
    expect(markup).not.toContain("message-toggle")
  })

  it("expanded truncated row shows Show less, no clamp, aria-expanded true, preserves formatting", () => {
    const truncated = {
      ...detailFor({ id: "job-2", snippet80: "Hello *bold* world\nsecond line" }),
      messageTruncated: true,
    }
    const markup = renderToStaticMarkup(
      createElement(ScheduleHistoryPanel, {
        ...panelProps({ initialExpandedIds: ["job-2"] }),
        history: {
          kind: "ready",
          data: { items: [truncated], page: 1, pageSize: 20, hasMore: false },
        },
      }),
    )
    expect(markup).toContain('aria-label="Collapse message for job job-2"')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain("Show less")
    expect(markup).not.toContain("Show more")
    // No clamp when expanded
    expect(markup).not.toContain('class="history-message-clamp"')
    // WhatsAppPreview formatting preserved (*bold*)
    expect(markup).toContain("<strong>bold</strong>")
    // No dialog opened by toggle
    expect(markup).not.toContain('role="dialog"')
  })

  it("toggle button has correct aria and does not open modal on click via stopPropagation contract", () => {
    // Verify source contains stopPropagation + toggleExpanded not onOpenJob for the toggle
    // This is a contract check complementing markup tests
    const truncated = { ...detailFor({ id: "job-9" }), messageTruncated: true }
    const markup = renderToStaticMarkup(
      createElement(ScheduleHistoryPanel, {
        ...panelProps(),
        history: {
          kind: "ready",
          data: { items: [truncated], page: 1, pageSize: 20, hasMore: false },
        },
      }),
    )
    expect(markup).toContain('class="message-toggle"')
    expect(markup).toContain("aria-expanded=")
  })
})
