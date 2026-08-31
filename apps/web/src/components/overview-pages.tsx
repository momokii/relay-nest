import type * as React from "react"

import type { AnalyticsView, SessionView } from "../dashboard-api"
import type { AccountScope } from "../dashboard-model"
import type { ResourceState } from "../dashboard-state"
import { LoadingRows, Metric, Panel, StateNotice, StatusBadge } from "./ui"
import { ResourceStateBody, SessionRow } from "./view-support"

const WEBHOOK_EVIDENCE_NOTE =
  "Counts come from signed WhatsApp webhook events; if nothing appears, webhook ingestion is not connected yet or no activity occurred."

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.floor(hours / 24)} d`
}

export function OverviewPage({
  scope,
  sessions,
  analytics,
}: Readonly<{
  scope: AccountScope
  sessions: ResourceState<readonly SessionView[]>
  analytics: ResourceState<AnalyticsView>
}>): React.JSX.Element {
  const sessionList = sessions.kind === "ready" ? sessions.data : []
  const metrics = analytics.kind === "ready" ? analytics.data : undefined
  return (
    <div className="page-grid">
      <Panel
        eyebrow="Scoped operating picture"
        title={`${scope[0]?.toUpperCase()}${scope.slice(1)} overview`}
        description="Only evidence inside the selected account scope appears here."
      >
        {analytics.kind === "loading" ? <LoadingRows count={4} /> : null}
        {analytics.kind === "denied" ? (
          <StateNotice title="Scope denied" message={analytics.message} tone="error" />
        ) : null}
        {analytics.kind === "error" || analytics.kind === "unavailable" ? (
          <StateNotice title="Analytics unavailable" message={analytics.message} tone="warning" />
        ) : null}
        {metrics ? (
          <div className="metric-grid">
            <Metric
              label="Message volume"
              value={String(metrics.messageVolume.total)}
              detail="Evidence-backed only"
              title="Messages counted in this scope, from signed WhatsApp webhook events. Zero means no webhook activity has been ingested yet."
            />
            <Metric
              label="Acknowledgments"
              value={String(metrics.acknowledgments.acknowledged)}
              detail="Not recipient delivery"
              title="Messages the WhatsApp device or server acknowledged after submit. Transport evidence, not proof the recipient read the message."
            />
            <Metric
              label="Failure rate"
              value={
                metrics.failureRate === null
                  ? "Unknown"
                  : `${Math.round(metrics.failureRate * 100)}%`
              }
              detail="Window-scoped"
              title="Share of completed sends in this window whose dispatch failed. Unknown until at least one send completes in the window."
            />
            <Metric
              label="Session uptime"
              value={metrics.uptimeMs === null ? "Unknown" : formatDuration(metrics.uptimeMs)}
              detail="Status history required"
              title="Time sessions spent in an active status inside the window, reconstructed from recorded status history. Unknown without status history."
            />
          </div>
        ) : null}
      </Panel>
      <Panel
        eyebrow="Transport"
        title="Session posture"
        action={
          <StatusBadge
            label={sessionList.length ? `${sessionList.length} visible` : "No data yet"}
          />
        }
      >
        {sessions.kind === "loading" ? <LoadingRows count={3} /> : null}
        {sessions.kind === "denied" ? (
          <StateNotice title="Role or scope denied" message={sessions.message} tone="error" />
        ) : null}
        {sessionList.length === 0 && sessions.kind !== "loading" && sessions.kind !== "denied" ? (
          <StateNotice
            title="No sessions in scope"
            message="Link a session through an authorized server route before operational work can begin."
          />
        ) : null}
        {sessionList.map((session) => (
          <SessionRow session={session} key={session.id} />
        ))}
      </Panel>
      <Panel
        eyebrow="Human checkpoint"
        title="AI review posture"
        description="Suggestions never cross the send boundary by themselves."
      >
        <div className="checkpoint-summary">
          <StatusBadge label="Approval required" tone="warning" />
          <span>
            Draft, summary, and classification outputs remain pending until a human reviews them.
          </span>
        </div>
      </Panel>
      <Panel eyebrow="Known gaps" title="Operational evidence" tone="inset">
        <ul className="plain-list">
          <li>
            Schedule detail, edit, and cancel controls are available for persisted one-time jobs.
          </li>
          <li>General settings and user listing routes are not exposed by the API yet.</li>
          <li>Unknown transport evidence is shown as unknown, never converted to success.</li>
        </ul>
      </Panel>
    </div>
  )
}

export function AnalyticsPage({
  analytics,
}: Readonly<{ analytics: ResourceState<AnalyticsView> }>): React.JSX.Element {
  const data = analytics.kind === "ready" ? analytics.data : undefined
  return (
    <div className="page-grid">
      <Panel
        eyebrow="Scoped projection"
        title="Analytics"
        description={`Window and scope are mandatory at the API boundary. ${WEBHOOK_EVIDENCE_NOTE}`}
      >
        <ResourceStateBody
          state={analytics}
          emptyTitle="No analytics yet"
          emptyMessage="No projection evidence is available for this scope."
        />
        {data ? (
          <div className="metric-grid">
            <Metric
              label="Inbound"
              value={String(data.messageVolume.inbound)}
              title="Messages received in this scope, counted from signed WhatsApp webhook events. Requires webhook ingestion to be connected."
            />
            <Metric
              label="Outbound"
              value={String(data.messageVolume.outbound)}
              title="Messages you sent in this scope, counted from signed WhatsApp webhook events. Requires webhook ingestion to be connected."
            />
            <Metric
              label="Retries"
              value={String(data.retryCount)}
              title="Extra delivery attempts after the first try."
            />
            <Metric
              label="Contact activity"
              value={String(data.contactActivity)}
              title="New or updated verified contacts in this scope."
            />
          </div>
        ) : null}
      </Panel>
      <Panel eyebrow="Delivery evidence" title="Acknowledgment breakdown" tone="inset">
        <div className="status-list">
          <StatusBadge
            label={`Submitted · ${data?.acknowledgments.submitted ?? "Unknown"}`}
            title="WhatsApp accepted our submit — transport evidence, not recipient delivery proof."
          />
          <StatusBadge
            label={`Acknowledged · ${data?.acknowledgments.acknowledged ?? "Unknown"}`}
            tone="success"
            title="Device/server acknowledged the message; still not read-receipt proof."
          />
          <StatusBadge
            label={`Failed · ${data?.acknowledgments.failed ?? "Unknown"}`}
            tone="error"
            title="The WhatsApp provider reported this message could not be delivered."
          />
          <StatusBadge
            label={`Unknown · ${data?.acknowledgments.unknown ?? "Unknown"}`}
            tone="warning"
            title="No delivery evidence exists for this message yet; it is never counted as delivered."
          />
        </div>
        <p className="panel-description">
          Acknowledgment is transport evidence, not proof of recipient delivery.
        </p>
      </Panel>
    </div>
  )
}
