import { describe, expect, it } from "vitest"

import {
  CampaignForbiddenError,
  CampaignInputError,
  type CampaignPrincipal,
  type CampaignRecord,
  createCampaignService,
} from "../apps/api/src/campaigns"
import type { SchedulerJob } from "../apps/api/src/scheduler"

const scope = "personal" as const
const principal: CampaignPrincipal = { userId: "user-1", roles: ["operator"] }
const session = { id: "session-1", accountScope: scope, wahaSessionName: "personal" }
const scheduledFor = new Date("2030-01-01T12:00:00.000Z")

function campaignFixture(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "campaign-1",
    accountScope: scope,
    sessionId: session.id,
    contactGroupId: "group-1",
    wahaGroupId: "120@g.us",
    trigger: { type: "any" },
    scheduledAt: scheduledFor,
    state: "scheduled",
    createdBy: "user-1",
    schedulerJobId: "job-1",
    followUpMessage: null,
    ...overrides,
  }
}

const cancelledJobFixture = (jobId: string): SchedulerJob => ({
  id: jobId,
  sessionId: session.id,
  accountScope: scope,
  recipientPhone: "120@g.us",
  message: "hello group",
  scheduledFor,
  timezone: "UTC",
  idempotencyKey: `campaign:campaign-1`,
  state: "cancelled",
  attempts: 0,
  nextAttemptAt: null,
  leaseOwner: null,
  leaseExpiresAt: null,
  recoveryCode: null,
  failureCode: null,
})

type CampaignDeps = Parameters<typeof createCampaignService>[0]

function service(
  initial: CampaignRecord,
  overrides: Partial<CampaignDeps> = {},
): {
  campaigns: ReturnType<typeof createCampaignService>
  events: readonly string[]
  cancelledJobs: readonly { jobId: string; scope: "personal" | "business" }[]
  current: () => CampaignRecord
} {
  const events: string[] = []
  const cancelledJobs: { jobId: string; scope: "personal" | "business" }[] = []
  let current = initial
  const dependencies: CampaignDeps = {
    campaigns: {
      create: async () => {
        throw new Error("create is not used by cancel tests")
      },
      attachSchedulerJob: async () => null,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      list: async () => [],
      find: async () => current,
      cancel: async (id, cancelScope) => {
        events.push("campaigns:cancel")
        if (
          current.state !== "scheduled" ||
          id !== current.id ||
          cancelScope !== current.accountScope
        )
          return null
        current = { ...current, state: "cancelled" }
        return current
      },
      updateContactGroup: async () => null,
    },
    sessions: { find: async () => session },
    contactGroups: { hasGrant: async () => true },
    authorize: async () => ({ allowed: true }),
    scheduler: {
      schedule: async () => ({ jobId: "job-1", duplicate: false }),
      cancel: async (jobId, cancelScope) => {
        events.push("scheduler:cancel")
        cancelledJobs.push({ jobId, scope: cancelScope })
        return cancelledJobFixture(jobId)
      },
    },
    wahaForSession: async () => ({
      groups: async () => [],
      sendText: async () => ({ id: "message-1" }),
    }),
    ...overrides,
  }
  return {
    campaigns: createCampaignService(dependencies),
    events,
    cancelledJobs,
    current: () => current,
  }
}

describe("campaign cancel", () => {
  it("cancel marks campaign cancelled and cancels the linked scheduler job", async () => {
    const context = service(campaignFixture())
    const result = await context.campaigns.cancel(principal, "campaign-1", scope)
    expect(result.state).toBe("cancelled")
    expect(context.current().state).toBe("cancelled")
    // The scheduler job must be cancelled before the campaign row is updated.
    expect(context.events).toEqual(["scheduler:cancel", "campaigns:cancel"])
    expect(context.cancelledJobs).toEqual([{ jobId: "job-1", scope }])
  })

  it("re-cancelling a cancelled campaign is idempotent and does not touch the scheduler again", async () => {
    const context = service(campaignFixture())
    await context.campaigns.cancel(principal, "campaign-1", scope)
    const second = await context.campaigns.cancel(principal, "campaign-1", scope)
    expect(second.state).toBe("cancelled")
    expect(context.events).toEqual(["scheduler:cancel", "campaigns:cancel"])
  })

  it("rejects cancelling a sent campaign with a bad-input error", async () => {
    const context = service(campaignFixture({ state: "sent" }))
    await expect(context.campaigns.cancel(principal, "campaign-1", scope)).rejects.toBeInstanceOf(
      CampaignInputError,
    )
    expect(context.events).toEqual([])
  })

  it("rejects cancelling a failed campaign with a bad-input error", async () => {
    const context = service(campaignFixture({ state: "failed" }))
    await expect(context.campaigns.cancel(principal, "campaign-1", scope)).rejects.toBeInstanceOf(
      CampaignInputError,
    )
    expect(context.events).toEqual([])
  })

  it("rejects a cross-user cancel with a forbidden error and leaks nothing", async () => {
    const context = service(campaignFixture({ createdBy: "user-2" }))
    await expect(context.campaigns.cancel(principal, "campaign-1", scope)).rejects.toBeInstanceOf(
      CampaignForbiddenError,
    )
    expect(context.events).toEqual([])
  })

  it("cancels a campaign without a linked scheduler job without calling the scheduler", async () => {
    const context = service(campaignFixture({ schedulerJobId: null }))
    const result = await context.campaigns.cancel(principal, "campaign-1", scope)
    expect(result.state).toBe("cancelled")
    expect(context.events).toEqual(["campaigns:cancel"])
  })
})
