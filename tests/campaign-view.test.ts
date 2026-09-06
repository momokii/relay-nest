import { describe, expect, it } from "vitest"
import * as React from "../apps/web/node_modules/react"
import { renderToStaticMarkup } from "../apps/web/node_modules/react-dom/server"

import { type Campaign, campaignTitle, isTerminal } from "../apps/web/src/campaign-api"
import { CampaignList } from "../apps/web/src/components/campaign-list"
import type { SessionView } from "../apps/web/src/dashboard-api"

const contactGroups = [{ id: "cg-1", name: "Family" }]

const sessions: readonly SessionView[] = [
  {
    id: "ses-1",
    accountScope: "personal",
    name: "Personal session",
    status: "WORKING",
    serviceHealth: "unknown",
    sendingReadiness: "unknown",
  },
]

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "c-1",
    accountScope: "personal",
    sessionId: "ses-1",
    contactGroupId: "cg-1",
    wahaGroupId: "12025550001@g.us",
    wahaGroupSubject: "Family Group",
    trigger: { type: "any" },
    scheduledAt: "2026-09-05T10:00:00.000Z",
    state: "scheduled",
    createdBy: "user-1",
    schedulerJobId: null,
    messagePreview: "Hello family",
    timezone: "Asia/Jakarta",
    ...overrides,
  }
}

function renderList(campaigns: readonly Campaign[]): string {
  return renderToStaticMarkup(
    React.createElement(CampaignList, {
      campaigns,
      contactGroups,
      sessions,
      onCancel: () => undefined,
      onChangeGroup: () => undefined,
    }),
  )
}

describe("campaign view", () => {
  it("campaign title resolves subject before JID", () => {
    // Given a campaign with both a WAHA group subject and a raw group JID
    // When the campaign list renders
    const markup = renderList([campaign()])

    // Then the row title shows the human subject and never the raw JID
    expect(markup).toContain("Family Group")
    expect(markup).not.toContain("12025550001@g.us")
  })

  it("falls back to the group JID only for a legacy campaign without subject", () => {
    // Given a legacy campaign whose subject is null
    // When the campaign list renders
    const markup = renderList([campaign({ wahaGroupSubject: null })])

    // Then the raw JID is the only available title
    expect(markup).toContain("12025550001@g.us")
  })

  it("renders the Campaigns eyebrow with the full metadata line", () => {
    // Given a campaign with contact group, session, schedule, timezone, and preview
    // When the campaign list renders
    const markup = renderList([campaign()])

    // Then the panel eyebrow is Campaigns and the meta line carries every field
    expect(markup).toContain("Campaigns")
    expect(markup).not.toContain("Durable jobs")
    expect(markup).toContain("Family")
    expect(markup).toContain("Personal session")
    expect(markup).toContain(new Date("2026-09-05T10:00:00.000Z").toLocaleString())
    expect(markup).toContain("Asia/Jakarta")
    expect(markup).toContain("Hello family")
    expect(markup).toContain("any emoji")
  })

  it("keeps metadata readable when optional fields are null", () => {
    // Given a campaign with null subject, preview, and timezone (stale legacy row)
    // When the campaign list renders
    const markup = renderList([
      campaign({ wahaGroupSubject: null, messagePreview: null, timezone: null }),
    ])

    // Then the row still renders without crashing and keeps the localized date
    expect(markup).toContain(new Date("2026-09-05T10:00:00.000Z").toLocaleString())
    expect(markup).toContain("Contact group")
  })

  it("shows the Cancel action only for scheduled campaigns", () => {
    // Given one campaign per lifecycle state
    const markup = renderList([
      campaign({ id: "c-scheduled", state: "scheduled" }),
      campaign({ id: "c-sent", state: "sent" }),
      campaign({ id: "c-failed", state: "failed" }),
      campaign({ id: "c-cancelled", state: "cancelled" }),
    ])

    // Then only the scheduled row exposes Cancel, and terminal states stay badges
    expect(markup.match(/>Cancel<\/button>/g)?.length).toBe(1)
    expect(markup).toContain("status-success")
    expect(markup).toContain("status-error")
    expect(markup).toContain("cancelled")
  })

  it("campaignTitle trims whitespace-only subjects back to the JID", () => {
    // Given a malformed whitespace-only subject
    const row = campaign({ wahaGroupSubject: "   " })

    // Then the title falls back to the JID instead of rendering blank space
    expect(campaignTitle(row)).toBe("12025550001@g.us")
    expect(campaignTitle(campaign())).toBe("Family Group")
  })

  it("isTerminal marks sent, failed, and cancelled but not scheduled", () => {
    // Given every campaign lifecycle state
    // Then only terminal states are reported as terminal
    expect(isTerminal(campaign({ state: "scheduled" }))).toBe(false)
    expect(isTerminal(campaign({ state: "sent" }))).toBe(true)
    expect(isTerminal(campaign({ state: "failed" }))).toBe(true)
    expect(isTerminal(campaign({ state: "cancelled" }))).toBe(true)
  })
})
