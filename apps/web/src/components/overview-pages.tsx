import type * as React from "react"

import type { AnalyticsView, SessionView } from "../dashboard-api"
import type { AccountScope } from "../dashboard-model"
import type { ResourceState } from "../dashboard-state"
import { LoadingRows, Metric, Panel, StateNotice, StatusBadge } from "./ui"
import { ResourceStateBody, SessionRow } from "./view-support"

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
              value={metrics.messageVolume.total === 0 ? "No data yet" : "Available"}
              detail="Evidence-backed only"
            />
            <Metric
              label="Acknowledgments"
              value={metrics.acknowledgments.acknowledged === 0 ? "Unknown" : "Available"}
              detail="Not recipient delivery"
            />
            <Metric
              label="Failure rate"
              value={metrics.failureRate === null ? "Unknown" : "Available"}
              detail="Window-scoped"
            />
            <Metric
              label="Session uptime"
              value={metrics.uptimeMs === null ? "Unknown" : "Available"}
              detail="Status history required"
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
        description="Window and scope are mandatory at the API boundary."
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
              value={data.messageVolume.inbound ? "Available" : "No data yet"}
            />
            <Metric
              label="Outbound"
              value={data.messageVolume.outbound ? "Available" : "No data yet"}
            />
            <Metric label="Retries" value={data.retryCount ? "Available" : "No data yet"} />
            <Metric
              label="Contact activity"
              value={data.contactActivity ? "Available" : "No data yet"}
            />
          </div>
        ) : null}
      </Panel>
      <Panel eyebrow="Delivery evidence" title="Acknowledgment breakdown" tone="inset">
        <div className="status-list">
          <StatusBadge label={`Submitted · ${data?.acknowledgments.submitted ?? "Unknown"}`} />
          <StatusBadge
            label={`Acknowledged · ${data?.acknowledgments.acknowledged ?? "Unknown"}`}
            tone="success"
          />
          <StatusBadge
            label={`Failed · ${data?.acknowledgments.failed ?? "Unknown"}`}
            tone="error"
          />
          <StatusBadge
            label={`Unknown · ${data?.acknowledgments.unknown ?? "Unknown"}`}
            tone="warning"
          />
        </div>
        <p className="panel-description">
          Acknowledgment is transport evidence, not proof of recipient delivery.
        </p>
      </Panel>
    </div>
  )
}
