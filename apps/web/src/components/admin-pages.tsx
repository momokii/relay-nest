import type * as React from "react"
import { useEffect, useState } from "react"
import { createDashboardAdminApi } from "../dashboard-admin-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import {
  RETENTION_CATEGORIES,
  type RetentionCategory,
  type RetentionPolicy,
  type RetentionPolicyInput,
  type RetentionPreview,
} from "../dashboard-retention-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { resourceFromResult } from "../dashboard-state"
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
  onPreview: (scope: AccountScope, category: RetentionCategory) => Promise<void>
  purgePreview: ActionState<RetentionPreview>
  onPurge: (
    scope: AccountScope,
    input: Readonly<{
      category: RetentionCategory
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
  const [category, setCategory] = useState<RetentionCategory>("messages")
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
          <select
            value={category}
            onChange={(event) => {
              const next = RETENTION_CATEGORIES.find(
                (candidate) => candidate === event.target.value,
              )
              if (next) setCategory(next)
            }}
          >
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
          aria-busy={purgePreview.kind === "submitting" ? "true" : "false"}
        >
          Preview before purge
        </button>
        {purgePreview.kind === "ready" ? (
          <div className="confirmation-block">
            <StateNotice
              title="Preview ready"
              message={`The server selected ${purgePreview.data.count} records before ${purgePreview.data.cutoff}.`}
              live="polite"
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
              disabled={purgeAction.kind === "submitting"}
              aria-busy={purgeAction.kind === "submitting" ? "true" : "false"}
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
            live="polite"
          />
        ) : null}
        {purgeAction.kind === "unavailable" ||
        purgeAction.kind === "denied" ||
        purgeAction.kind === "error" ? (
          <StateNotice
            title="Purge unavailable"
            message={purgeAction.message}
            tone="error"
            live="polite"
          />
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

type SettingsPageProps = Readonly<{
  role: DashboardRole
  scope: AccountScope
  principal: { readonly user: { readonly email: string; readonly displayName: string } }
  sessions: ResourceState<readonly import("../dashboard-api").SessionView[]>
  users: ResourceState<readonly import("../dashboard-admin-api").AdminUserRecord[]>
  retention: ResourceState<readonly RetentionPolicy[]>
  isDemo: boolean
}>

export function SettingsPage({
  role,
  scope,
  principal,
  sessions,
  users,
  retention,
  isDemo,
}: SettingsPageProps): React.JSX.Element {
  const sessionCount = sessions.kind === "ready" ? sessions.data.length : null
  const userCount = users.kind === "ready" ? users.data.length : null
  const activeUsers =
    users.kind === "ready" ? users.data.filter((user) => user.active).length : null
  const retentionCount = retention.kind === "ready" ? retention.data.length : null
  const isAdmin = role === "admin"
  const [connections, setConnections] = useState<
    ResourceState<
      readonly { readonly id: string; readonly name: string; readonly baseUrl: string }[]
    >
  >({ kind: "loading" })
  useEffect(() => {
    if (!isAdmin) return
    const api = createDashboardAdminApi(import.meta.env.VITE_API_BASE_URL)
    void api.listConnections().then((result) => setConnections(resourceFromResult(result)))
  }, [isAdmin])
  return (
    <div className="page-grid settings-page">
      <Panel
        eyebrow="Workspace policy"
        title="Settings — operational control center"
        description="Single self-hosted tenant, Personal and Business hard-separated. Admins manage everything from this app — users, grants, sessions, retention, notifications, and WAHA link state. No public registration, no browser-visible secrets, no raw provider launchers. Everything an Admin needs is reachable via the sidebar; this page gives the full inventory and safe-boundary map so no external tool is required."
      >
        <div className="metric-grid">
          <div className="metric">
            <span className="metric-label">Signed in as</span>
            <strong>{principal.user.displayName}</strong>
            <span className="metric-detail">{principal.user.email}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Current scope & role</span>
            <strong>
              {scope} · {role}
            </strong>
            <span className="metric-detail">
              {isDemo ? "Demo data boundary" : "Live data boundary"}
            </span>
          </div>
        </div>
        <Divider />
        <StateNotice
          title={isAdmin ? "Admin has full change power" : "Viewer is read-only here"}
          message={
            isAdmin
              ? "You can create users, grant sessions, reset passwords, disable/enable accounts, link WAHA sessions, run retention purges, and configure notifications — all from the sidebar. No external dashboard is needed."
              : "Viewers can inspect inventory and policy but cannot mutate users, grants, sessions, or retention. Ask an Admin for changes."
          }
          {...(isAdmin ? { tone: "warning" as const } : {})}
        />
      </Panel>

      <Panel eyebrow="Live inventory" title="What exists right now">
        <div className="metric-grid">
          <div className="metric">
            <span className="metric-label">Users</span>
            <strong>
              {userCount === null ? "…" : `${userCount} total`}
              {activeUsers !== null && userCount !== null ? ` · ${activeUsers} active` : ""}
            </strong>
            <span className="metric-detail">
              {users.kind === "loading"
                ? "Loading users…"
                : users.kind === "ready"
                  ? `${users.data.filter((user) => user.roles.length === 0).length} with no roles · ${users.data.filter((user) => user.grants.length === 0).length} with no grants`
                  : users.kind === "error"
                    ? users.message
                    : "Users unavailable"}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">WAHA sessions in this scope</span>
            <strong>{sessionCount === null ? "…" : `${sessionCount} in ${scope}`}</strong>
            <span className="metric-detail">
              {sessions.kind === "loading"
                ? "Loading sessions…"
                : sessions.kind === "ready"
                  ? sessions.data.length === 0
                    ? "No sessions linked yet — use Sessions → Link a session"
                    : `${sessions.data.filter((session) => session.status === "working").length} working · ${sessions.data.filter((session) => session.status !== "working").length} other`
                  : sessions.kind === "error"
                    ? sessions.message
                    : "Sessions unavailable"}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Retention policies</span>
            <strong>{retentionCount === null ? "…" : `${retentionCount} categories`}</strong>
            <span className="metric-detail">
              {retention.kind === "ready"
                ? retention.data
                    .map((policy) => `${policy.category}:${policy.retentionDays}d`)
                    .join(" · ") || "No policies"
                : retention.kind === "loading"
                  ? "Loading policies…"
                  : "Retention unavailable"}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Data & safety</span>
            <strong>One-time texts only</strong>
            <span className="metric-detail">
              Immediate + scheduled 80-char previews, bounded retries, and recovery states. No media
              or broadcasts.
            </span>
          </div>
        </div>
        <Divider />
        <p className="panel-description" style={{ maxWidth: "none" }}>
          <strong>No roles / no grants:</strong> the user can sign in but sees no sessions and every
          scoped call is 403 until an Admin gives a role and a grant. <strong>Disabled:</strong>{" "}
          `active=false` → login blocked, all `authSessions` revoked; re-enable from Users → Enable
          to restore sign-in (grants stay revoked and must be re-granted). <strong>Grant:</strong>{" "}
          per-session, per-scope, audited — a role alone never opens a WAHA session.
        </p>
      </Panel>

      <Panel eyebrow="Quick control" title="Do everything from here — no external tool needed">
        <ul className="plain-list">
          <li>
            <strong>Users</strong> — create, search, filter by status/role, grant one session at a
            time, reset password, disable / enable (reversible), paginate
          </li>
          <li>
            <strong>Sessions</strong> — link WAHA connection, start/stop/restart/logout/delete
            (confirmation-gated), load status history
          </li>
          <li>
            <strong>Send / Schedule</strong> — one-time text with consent, pacing, quiet-hours,
            duplicate/burst gates; edit/cancel scheduled, delete terminal
          </li>
          <li>
            <strong>Contacts</strong> — resolve one consent-aware individual via WAHA lookup or
            validated phone
          </li>
          <li>
            <strong>Retention</strong> — per-category 30d default, preview-before-purge with token,
            content-free audit
          </li>
          <li>
            <strong>Notifications</strong> — SMTP + Telegram independently enabled, masked settings,
            test & failure history
          </li>
          <li>
            <strong>Analytics</strong> — scoped projections, no delivery inference from HTTP
          </li>
          <li>
            <strong>Backups</strong> — AES-256-GCM authenticated backups per docs/operations.md (CLI
            `backup`); this UI surfaces status, not secrets
          </li>
        </ul>
        <StateNotice
          title="Admin path"
          message="All mutating actions require Admin role in the selected scope + CSRF + same-origin. Use the left nav — every control is inside the app."
          tone="warning"
        />
      </Panel>

      {isAdmin ? (
        <Panel eyebrow="WAHA" title="WAHA credentials — admin only">
          <p className="panel-description" style={{ maxWidth: "none" }}>
            Connection profile stays server-side. Base URL and name are shown here; API key is
            AES-256-GCM encrypted at rest and loaded from Docker secret <code>waha_api_key</code> —
            never exposed raw to the browser. Use this inventory to verify which WAHA you are linked
            to.
          </p>
          {connections.kind === "loading" ? (
            <p className="panel-description">Loading WAHA connections…</p>
          ) : connections.kind === "ready" ? (
            connections.data.length === 0 ? (
              <StateNotice
                title="No WAHA connections"
                message="No active WAHA connection found. Seed the bundled WAHA or create one via the API with an encrypted API key."
              />
            ) : (
              <div className="retention-list">
                {connections.data.map((connection) => (
                  <div className="retention-row" key={connection.id}>
                    <span>
                      <strong>{connection.name}</strong> —{" "}
                      <code title={connection.baseUrl}>{connection.baseUrl}</code>
                      <br />
                      <small title={connection.id}>
                        id {connection.id.slice(0, 8)}…{connection.id.slice(-4)}
                      </small>{" "}
                      · <code>API key •••• (Docker secret)</code>
                    </span>
                    <StatusBadge label="active" tone="success" />
                  </div>
                ))}
              </div>
            )
          ) : (
            <StateNotice
              title="WAHA connections unavailable"
              message={
                connections.kind === "error" || connections.kind === "denied"
                  ? connections.message
                  : "Could not load WAHA connections."
              }
              tone="warning"
            />
          )}
        </Panel>
      ) : null}

      {isAdmin ? (
        <Panel eyebrow="Admin diagnostics" title="Full data map — admin only" tone="inset">
          <ul className="plain-list">
            <li>
              <strong>Users:</strong>{" "}
              {userCount === null
                ? "…"
                : `${userCount} total · ${activeUsers ?? "…"} active · ${userCount - (activeUsers ?? 0)} disabled`}
              {users.kind === "ready"
                ? ` — ${users.data.filter((user) => user.roles.length === 0).length} no roles, ${users.data.filter((user) => user.grants.length === 0).length} no grants`
                : ""}
            </li>
            <li>
              <strong>Sessions in {scope}:</strong>{" "}
              {sessionCount === null ? "…" : `${sessionCount} total`}
              {sessions.kind === "ready" && sessions.data.length > 0
                ? ` — ${sessions.data.map((session) => `${session.name}:${session.status}`).join(" · ")}`
                : ""}
            </li>
            <li>
              <strong>Retention:</strong>{" "}
              {retention.kind === "ready"
                ? retention.data
                    .map((policy) => `${policy.category} ${policy.retentionDays}d`)
                    .join(" · ")
                : "loading…"}
            </li>
            <li>
              <strong>WAHA:</strong> internal `waha:3000`, dashboard `127.0.0.1:8080` loopback by
              default, public via reverse-proxy TLS + firewall — credentials stay in Docker secrets
            </li>
            <li>
              <strong>Encryption:</strong> AES-256-GCM, key from Docker secret, per-scope AAD
            </li>
            <li>
              <strong>Boundary:</strong> single tenant, Personal/Business hard-separated, no public
              registration, no raw provider launcher
            </li>
          </ul>
          <StatusBadge label="Admin full data visible" tone="warning" />
        </Panel>
      ) : null}
    </div>
  )
}
