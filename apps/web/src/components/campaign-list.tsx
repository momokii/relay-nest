import type * as React from "react"
import type { Campaign } from "../campaign-api"
import { Panel, StateNotice, StatusBadge } from "./ui"

export function CampaignList({
  campaigns,
  onCancel,
}: Readonly<{
  campaigns: readonly Campaign[]
  onCancel: (id: string) => void
}>): React.JSX.Element {
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
        <div className="campaign-list">
          {campaigns.map((campaign) => (
            <article className="campaign-row" key={campaign.id}>
              <div>
                <strong>{campaign.wahaGroupId}</strong>
                <span>
                  {new Date(campaign.scheduledAt).toLocaleString()} · trigger:{" "}
                  {campaign.trigger.type === "emoji" ? "per emoji" : "any emoji"}
                </span>
              </div>
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
            </article>
          ))}
        </div>
      )}
    </Panel>
  )
}
