import type * as React from "react"
import { useState } from "react"

import type { RetentionPolicy, RetentionPreview } from "../dashboard-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import type { RetentionPolicyInput } from "../dashboard-retention-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { RetentionPolicyForm } from "./retention-policy-form"
import { Divider, Panel, StateNotice, StatusBadge } from "./ui"
import { ResourceStateBody } from "./view-support"

export function RetentionPage({
  scope,
  role,
  retention,
  onPreview,
  purgePreview,
  onPurge,
  purgeAction,
  retentionPolicyAction,
  onUpdatePolicy,
  onCancelPreview,
}: Readonly<{
  scope: AccountScope
  role: DashboardRole
  retention: ResourceState<readonly RetentionPolicy[]>
  onPreview: (scope: AccountScope, category: string) => Promise<void>
  purgePreview: ActionState<RetentionPreview>
  onPurge: (
    scope: AccountScope,
    input: Readonly<{
      category: string
      cutoff: string
      previewCount: number
      previewToken: string
    }>,
  ) => Promise<void>
  purgeAction: ActionState<{ readonly deletedCount: number }>
  retentionPolicyAction: ActionState<unknown>
  onUpdatePolicy: (scope: AccountScope, input: RetentionPolicyInput) => Promise<void>
  onCancelPreview: () => void
}>): React.JSX.Element {
  const [category, setCategory] = useState("messages")
  if (role !== "admin")
    return (
      <Panel eyebrow="Admin only" title="Retention">
        <StateNotice
          title="Role denied"
          message="Retention policies and purge controls require an Admin in the selected scope."
          tone="warning"
        />
      </Panel>
    )
  const policies = retention.kind === "ready" ? retention.data : []
  return (
    <div className="page-grid">
      <Panel
        eyebrow="Data lifecycle"
        title="Retention"
        description="Changing policy does not delete data. Purge requires a preview and explicit confirmation."
      >
        <ResourceStateBody
          state={retention}
          emptyTitle="No policy data yet"
          emptyMessage="The server has not returned retention policies for this scope."
        />
        <div className="retention-list">
          {policies.map((policy) => (
            <div className="retention-row" key={policy.id}>
              <span>{policy.category}</span>
              <strong>
                {policy.retentionDays === 0 ? "Unknown" : `${policy.retentionDays} days`}
              </strong>
            </div>
          ))}
        </div>
        <RetentionPolicyForm scope={scope} action={retentionPolicyAction} onSave={onUpdatePolicy} />
        <Divider />
        <label>
          <span>Preview category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="messages">Messages</option>
            <option value="contacts">Contacts</option>
            <option value="events">Events</option>
            <option value="notifications">Notifications</option>
            <option value="audit">Audit</option>
          </select>
        </label>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void onPreview(scope, category)}
          disabled={purgePreview.kind === "submitting"}
        >
          Preview before purge
        </button>
        {purgePreview.kind === "ready" ? (
          <div className="confirmation-block">
            <StateNotice
              title="Preview ready"
              message={`The server selected ${purgePreview.data.count} records before ${purgePreview.data.cutoff}.`}
            />
            <button
              className="button button-danger"
              type="button"
              onClick={() =>
                void onPurge(scope, {
                  category,
                  cutoff: purgePreview.data.cutoff,
                  previewCount: purgePreview.data.count,
                  previewToken: purgePreview.data.previewToken,
                })
              }
            >
              Confirm selected purge
            </button>
            <button className="button button-secondary" type="button" onClick={onCancelPreview}>
              Cancel preview
            </button>
          </div>
        ) : null}
        {purgeAction.kind === "ready" ? (
          <StateNotice
            title="Purge completed"
            message={`${purgeAction.data.deletedCount} records removed from the confirmed scope.`}
          />
        ) : null}
        {purgeAction.kind === "unavailable" ||
        purgeAction.kind === "denied" ||
        purgeAction.kind === "error" ? (
          <StateNotice title="Purge unavailable" message={purgeAction.message} tone="error" />
        ) : null}
      </Panel>
      <Panel eyebrow="Accountability" title="Purge safety" tone="warning">
        <StateNotice
          title="Confirmation required"
          message="A stale preview, mismatched scope, or missing confirmation must fail closed. Audit accountability remains content-free."
          tone="warning"
        />
      </Panel>
    </div>
  )
}

export function SettingsPage({ role }: Readonly<{ role: DashboardRole }>): React.JSX.Element {
  return (
    <div className="page-grid">
      <Panel eyebrow="Workspace policy" title="Settings">
        <StateNotice
          title="General settings unavailable"
          message="No general settings route is exposed. WAHA credentials and runtime connection details stay server-side."
          tone="warning"
        />
      </Panel>
      <Panel eyebrow="Security boundary" title="What this UI will not expose" tone="inset">
        <ul className="plain-list">
          <li>WAHA master keys or session credentials</li>
          <li>Raw unrestricted provider endpoint launchers</li>
          <li>Public registration or client-side authorization decisions</li>
        </ul>
        {role === "admin" ? (
          <StatusBadge label="Admin warning visible" tone="warning" />
        ) : (
          <StatusBadge label="Viewer read-only" />
        )}
      </Panel>
    </div>
  )
}
