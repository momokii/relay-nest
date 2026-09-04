import { describe, expect, it } from "vitest"

import {
  CampaignForbiddenError,
  CampaignInputError,
  type CampaignPrincipal,
  createCampaignService,
} from "./campaigns"

const principal: CampaignPrincipal = { userId: "user-1", roles: ["operator"] }
const session = { id: "session-1", accountScope: "personal" as const, wahaSessionName: "personal" }
const input = {
  sessionId: session.id,
  accountScope: session.accountScope,
  contactGroupId: "group-1",
  wahaGroupId: "120@g.us",
  message: "hello group",
  trigger: { type: "any" },
  scheduledAt: new Date("2030-01-01T12:00:00.000Z"),
  timezone: "UTC",
}

function service(overrides: Partial<Parameters<typeof createCampaignService>[0]> = {}) {
  return createCampaignService({
    campaigns: {
      create: async (value) => ({
        ...value,
        id: "campaign-1",
        state: "scheduled" as const,
        schedulerJobId: null,
        followUpMessage: value.followUpMessage ?? null,
        trigger: value.trigger,
        createdBy: value.createdBy,
      }),
      attachSchedulerJob: async (id, scope, schedulerJobId) => ({
        ...input,
        id,
        accountScope: scope,
        state: "scheduled" as const,
        schedulerJobId,
        followUpMessage: null,
        createdBy: principal.userId,
      }),
      markSent: async () => undefined,
      markFailed: async () => undefined,
      list: async () => [],
      find: async () => null,
      cancel: async () => null,
    },
    sessions: { find: async () => session },
    contactGroups: { hasGrant: async () => true },
    authorize: async () => ({ allowed: true }),
    scheduler: { schedule: async () => ({ jobId: "job-1", duplicate: false }) },
    wahaForSession: async () => ({
      groups: async () => [{ id: input.wahaGroupId }],
      sendText: async () => ({ id: "message-1" }),
    }),
    now: () => new Date("2029-01-01T00:00:00.000Z"),
    ...overrides,
  })
}

describe("campaign scheduling", () => {
  it("creates a scheduled group campaign job", async () => {
    const result = await service().schedule(principal, input)
    expect(result.state).toBe("scheduled")
    expect(result.schedulerJobId).toBe("job-1")
  })

  it("rejects a session outside the principal scope with a forbidden error", async () => {
    const campaignService = service({ authorize: async () => ({ allowed: false }) })
    await expect(campaignService.schedule(principal, input)).rejects.toBeInstanceOf(
      CampaignForbiddenError,
    )
  })

  it("rejects a past scheduledAt with a bad-input error", async () => {
    const campaignService = service({ now: () => new Date("2031-01-01T00:00:00.000Z") })
    await expect(campaignService.schedule(principal, input)).rejects.toBeInstanceOf(
      CampaignInputError,
    )
  })
})
