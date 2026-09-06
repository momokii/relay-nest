import type * as React from "react"
import { type Campaign, campaignTitle, isTerminal } from "../campaign-api"
import type { SessionView } from "../dashboard-api"
import { Panel, StateNotice, StatusBadge } from "./ui"

const BADGE_TONES: Record<Campaign["state"], "success" | "warning" | "error" | "info"> = {
  scheduled: "info",
  sent: "success",
  failed: "error",
  cancelled: "info",
}

export function CampaignList({
  campaigns,
  contactGroups,
  sessions,
  onCancel,
  onDelete,
  onChangeGroup,
}: Readonly<{
  campaigns: readonly Campaign[]
  contactGroups: readonly { id: string; name: string }[]
  sessions: readonly SessionView[]
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onChangeGroup: (id: string, contactGroupId: string) => void
}>): React.JSX.Element {
  const groupName = (id: string) =>
    contactGroups.find((group) => group.id === id)?.name ?? id.slice(0, 8)
  const sessionName = (id: string) =>
    sessions.find((session) => session.id === id)?.name ?? id.slice(0, 8)
  return (
    <Panel
      eyebrow="Campaigns"
      title="Campaign history"
      description="Only campaigns returned for the active account scope are shown."
    >
      {campaigns.length === 0 ? (
        <StateNotice
          title="No campaigns in this scope"
          message="Create a campaign to see its schedule and trigger state here."
        />
      ) : (
        <div className="campaign-list" style={{ display: "grid", gap: "var(--space-3)" }}>
          {campaigns.map((campaign) => (
            <article
              className="campaign-row"
              key={campaign.id}
              style={{
                display: "grid",
                gap: "var(--space-2)",
                padding: "var(--space-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-control)",
                background: "var(--color-surface)",
              }}
            >
              <div style={{ display: "grid", gap: "var(--space-1)" }}>
                <strong>{campaignTitle(campaign)}</strong>
                <small style={{ color: "var(--color-muted)" }}>
                  Contact group: <strong>{groupName(campaign.contactGroupId)}</strong> · Session:{" "}
                  <strong>{sessionName(campaign.sessionId)}</strong> ·{" "}
                  {new Date(campaign.scheduledAt).toLocaleString()}
                  {campaign.timezone ? ` · ${campaign.timezone}` : ""} · trigger:{" "}
                  {campaign.trigger.type === "emoji" ? "per emoji" : "any emoji"}
                </small>
                {campaign.messagePreview ? (
                  <small style={{ color: "var(--color-muted)" }}>
                    Message: {campaign.messagePreview}
                  </small>
                ) : null}
                <label
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    alignItems: "center",
                    fontSize: "var(--type-small)",
                  }}
                >
                  <span>Change group:</span>
                  <select
                    defaultValue={campaign.contactGroupId}
                    onChange={(e) => {
                      const newId = e.target.value
                      if (newId && newId !== campaign.contactGroupId)
                        onChangeGroup(campaign.id, newId)
                    }}
                    style={{
                      flex: 1,
                      minHeight: "2rem",
                      padding: "var(--space-1) var(--space-2)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-control)",
                    }}
                  >
                    {contactGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <StatusBadge label={campaign.state} tone={BADGE_TONES[campaign.state]} />
                {!isTerminal(campaign) ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => onCancel(campaign.id)}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => onDelete(campaign.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  )
}
