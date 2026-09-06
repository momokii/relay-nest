import type * as React from "react"

import type { AccountScope } from "../dashboard-model"
import type { ScheduleEditInput, ScheduleRemoval, ScheduleView } from "../dashboard-schedule-api"
import type { SentHistoryDetail, SentHistoryPage, SentHistoryState } from "../dashboard-session-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { ScheduleDetailModal } from "./schedule-detail-modal"
import { InfoHint, Panel, StateNotice, StatusBadge } from "./ui"
import { formatScheduleDate, scheduleStateTone } from "./view-support"

export type ScheduleHistoryPanelProps = Readonly<{
  scope: AccountScope
  history: ResourceState<SentHistoryPage>
  page: number
  pageSize: number
  q: string
  stateFilter: SentHistoryState | ""
  from: string
  to: string
  openJobId: string
  detail: ResourceState<SentHistoryDetail | undefined>
  editAction: ActionState<ScheduleView>
  cancelAction: ActionState<ScheduleView>
  deleteAction: ActionState<ScheduleRemoval>
  loadPage: (page: number) => void
  setPageSize: (value: number) => void
  setQ: (value: string) => void
  setStateFilter: (value: SentHistoryState | "") => void
  setFrom: (value: string) => void
  setTo: (value: string) => void
  onOpenJob: (jobId: string) => void
  onCloseJob: () => void
  onEdit: (
    scope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ) => Promise<void>
  onCancel: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
  onDelete: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
}>

function truncatedProviderId(value: string | null): string {
  if (!value) return "—"
  return value.length > 24 ? `${value.slice(0, 21)}…` : value
}

function formatRecipient(item: {
  recipientPhone: string | null
  recipientName?: string | null | undefined
}): string {
  if (item.recipientName) return `${item.recipientName} · ${item.recipientPhone ?? ""}`.trim()
  return item.recipientPhone ?? "Unavailable"
}

export function ScheduleHistoryPanel({
  scope,
  history,
  page,
  pageSize,
  q,
  stateFilter,
  from,
  to,
  openJobId,
  detail,
  editAction,
  cancelAction,
  deleteAction,
  loadPage,
  setPageSize,
  setQ,
  setStateFilter,
  setFrom,
  setTo,
  onOpenJob,
  onCloseJob,
  onEdit,
  onCancel,
  onDelete,
}: ScheduleHistoryPanelProps): React.JSX.Element {
  const items = history.kind === "ready" ? history.data.items : []
  const hasMore = history.kind === "ready" ? history.data.hasMore : false
  return (
    <Panel
      eyebrow={`${scope} scope`}
      title="Schedule history"
      description="One combined history of scheduled, in-flight, and completed texts. Rows show a preview only; open a row for the full record and actions."
    >
      <div className="schedule-filters">
        <label
          className="schedule-filter-field schedule-filter-search"
          title="Search is debounced 3s after you stop typing"
        >
          <span>
            Search{" "}
            <small
              style={{
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: 0,
                color: "var(--color-subtle)",
              }}
            >
              (3s debounce)
            </small>
          </span>
          <input
            aria-label="Search schedule history"
            placeholder="Message or recipient…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <label className="schedule-filter-field">
          <span>State</span>
          <select
            aria-label="Filter by state"
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as SentHistoryState | "")}
          >
            <option value="">All states</option>
            <option value="scheduled">scheduled</option>
            <option value="queued">queued</option>
            <option value="attempting">attempting</option>
            <option value="submitted">submitted</option>
            <option value="acknowledged">acknowledged</option>
            <option value="failed">failed</option>
            <option value="unknown">unknown</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        <label className="schedule-filter-field">
          <span>From</span>
          <input
            type="date"
            aria-label="Filter from date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="schedule-filter-field">
          <span>To</span>
          <input
            type="date"
            aria-label="Filter to date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="schedule-filter-field schedule-filter-size">
          <span>Rows</span>
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      {history.kind === "loading" ? (
        <p className="panel-description">Loading schedule history…</p>
      ) : null}
      {history.kind === "unavailable" || history.kind === "denied" || history.kind === "error" ? (
        <StateNotice title="History unavailable" message={history.message} tone="warning" />
      ) : null}
      {history.kind === "ready" && items.length === 0 ? (
        <StateNotice
          title="No scheduled messages"
          message="No results for the current filters. Try clearing search or adjusting state/date filters."
        />
      ) : null}
      {history.kind === "ready" ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)", color: "var(--color-muted)", fontSize: "var(--type-small)" }}>
          <span>
            {history.kind === "ready" && typeof history.data.total === "number"
              ? `Total: ${history.data.total} ${history.data.total === 1 ? "message" : "messages"}${q || stateFilter || from || to ? " (filtered)" : ""} · showing ${items.length} on this page`
              : history.kind === "ready"
                ? `Showing ${items.length} ${items.length === 1 ? "message" : "messages"} on this page`
                : ""}
          </span>
          {history.kind === "ready" && (q || stateFilter || from || to) ? (
            <button
              type="button"
              className="button button-secondary"
              style={{ minHeight: "2rem", padding: "var(--space-1) var(--space-2)" }}
              onClick={() => {
                setQ("")
                setStateFilter("")
                setFrom("")
                setTo("")
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
      {history.kind === "ready" && items.length > 0 ? (
        <>
          <div className="sent-history-table-wrap">
            <table className="sent-history-table" aria-label={`${scope} schedule history`}>
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Message</th>
                  <th scope="col">When</th>
                  <th scope="col">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      State
                      <InfoHint message="scheduled=waiting to send · queued=retry scheduled · attempting=sending now · submitted=sent to WhatsApp · acknowledged=delivered · failed=provider rejected · unknown=missed/expired · cancelled=canceled by you" />
                    </span>
                  </th>
                  <th scope="col">Attempts</th>
                  <th scope="col">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      Provider ID
                      <InfoHint message="WhatsApp provider message ID returned by WAHA after submit (e.g. 3EB0...). Use it to correlate acks/receipts; empty while scheduled/queued, hover truncated value for full ID." />
                    </span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onOpenJob(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onOpenJob(item.id)
                    }}
                  >
                    <td title={item.recipientPhone ?? undefined}>{formatRecipient(item)}</td>
                    <td>{item.snippet80 ?? "Unavailable"}</td>
                    <td>
                      {formatScheduleDate(item.scheduledFor || item.createdAt)}
                      <small> · {item.timezone}</small>
                    </td>
                    <td>
                      <StatusBadge label={item.state} tone={scheduleStateTone(item.state)} />
                    </td>
                    <td>{item.attempts}</td>
                    <td>
                      <code title={item.providerMessageId ?? undefined}>
                        {truncatedProviderId(item.providerMessageId)}
                      </code>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-secondary"
                        aria-label={`View details for job ${item.id}`}
                        onClick={() => onOpenJob(item.id)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="sent-history-pagination" aria-label="Schedule history pagination">
            <span>
              Page {page} · {pageSize} per page
              {hasMore ? " · more available" : ""}
            </span>
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => loadPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => loadPage(page + 1)}
                disabled={!hasMore}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      ) : null}
      {openJobId ? (
        <ScheduleDetailModal
          detail={detail}
          editAction={editAction}
          cancelAction={cancelAction}
          deleteAction={deleteAction}
          onEdit={onEdit}
          onCancel={onCancel}
          onDelete={onDelete}
          onClose={onCloseJob}
        />
      ) : null}
    </Panel>
  )
}
