import type * as React from "react"
import type { Campaign } from "../campaign-api"
import { Panel, StateNotice, StatusBadge } from "./ui"

export function CampaignList({
  campaigns,
  contactGroups,
  onCancel,
  onChangeGroup,
}: Readonly<{
  campaigns: readonly Campaign[]
  contactGroups: readonly { id: string; name: string }[]
  onCancel: (id: string) => void
  onChangeGroup: (id: string, contactGroupId: string) => void
}>): React.JSX.Element {
  const groupName = (id: string) =>
    contactGroups.find((group) => group.id === id)?.name ?? id.slice(0, 8)
  return (
    <Panel
      eyebrow="Durable jobs"
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
                <strong>{campaign.wahaGroupId || "Custom group"}</strong>
                <small style={{ color: "var(--color-muted)" }}>
                  Contact group: <strong>{groupName(campaign.contactGroupId)}</strong> ·{" "}
                  {new Date(campaign.scheduledAt).toLocaleString()} · trigger:{" "}
                  {campaign.trigger.type === "emoji" ? "per emoji" : "any emoji"}
                </small>
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
                <StatusBadge
                  label={campaign.state}
                  tone={
                    campaign.state === "failed"
                      ? "error"
                      : campaign.state === "acknowledged"
                        ? "success"
                        : "warning"
                  }
                />
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => onCancel(campaign.id)}
                  disabled={campaign.state === "cancelled"}
                >
                  Cancel
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  )
}
