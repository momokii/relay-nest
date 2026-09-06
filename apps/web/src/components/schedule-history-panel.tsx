import type * as React from "react"

import type { AccountScope } from "../dashboard-model"
import type { ScheduleEditInput, ScheduleRemoval, ScheduleView } from "../dashboard-schedule-api"
import type { SentHistoryDetail, SentHistoryPage } from "../dashboard-session-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { ScheduleDetailModal } from "./schedule-detail-modal"
import { InfoHint, Panel, StateNotice, StatusBadge } from "./ui"
import { formatScheduleDate, scheduleStateTone } from "./view-support"

export type ScheduleHistoryPanelProps = Readonly<{
  scope: AccountScope
  history: ResourceState<SentHistoryPage>
  page: number
  openJobId: string
  detail: ResourceState<SentHistoryDetail | undefined>
  editAction: ActionState<ScheduleView>
  cancelAction: ActionState<ScheduleView>
  deleteAction: ActionState<ScheduleRemoval>
  loadPage: (page: number) => void
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

export function ScheduleHistoryPanel({
  scope,
  history,
  page,
  openJobId,
  detail,
  editAction,
  cancelAction,
  deleteAction,
  loadPage,
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
      {history.kind === "loading" ? (
        <p className="panel-description">Loading schedule history…</p>
      ) : null}
      {history.kind === "unavailable" || history.kind === "denied" || history.kind === "error" ? (
        <StateNotice title="History unavailable" message={history.message} tone="warning" />
      ) : null}
      {history.kind === "ready" && items.length === 0 ? (
        <StateNotice
          title="No scheduled messages"
          message="Scheduled and sent dispatches in this scope will appear here."
        />
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
                    <td>{item.recipientPhone ?? "Unavailable"}</td>
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
              Page {page}
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
