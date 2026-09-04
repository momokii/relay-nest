import type { AccountScope } from "./db/schema/shared"
import type { DispatchResult, SchedulerJob } from "./scheduler"
import { classifyWahaDispatchError } from "./scheduler"

export type CampaignTrigger = Readonly<{
  type: string
  emojiMap?: Readonly<Record<string, string>> | undefined
}>

export type CampaignPrincipal = Readonly<{ userId: string; roles: readonly string[] }>
export type CampaignRecord = Readonly<{
  id: string
  accountScope: AccountScope
  sessionId: string
  contactGroupId: string
  wahaGroupId: string
  trigger: unknown
  scheduledAt: Date
  state: "scheduled" | "sent" | "failed"
  createdBy: string
  schedulerJobId: string | null
  followUpMessage: string | null
}>

export class CampaignInputError extends Error {
  readonly name = "CampaignInputError"
}

export class CampaignForbiddenError extends Error {
  readonly name = "CampaignForbiddenError"
}

type CampaignRepository = {
  readonly create: (input: {
    readonly accountScope: AccountScope
    readonly sessionId: string
    readonly contactGroupId: string
    readonly wahaGroupId: string
    readonly message: string
    readonly followUpMessage?: string | undefined
    readonly trigger: CampaignTrigger
    readonly scheduledAt: Date
    readonly createdBy: string
  }) => Promise<CampaignRecord>
  readonly attachSchedulerJob: (
    id: string,
    scope: AccountScope,
    schedulerJobId: string,
  ) => Promise<CampaignRecord | null>
  readonly markSent: (id: string, scope: AccountScope) => Promise<unknown>
  readonly markFailed: (id: string, scope: AccountScope) => Promise<unknown>
}

type CampaignDependencies = Readonly<{
  readonly campaigns: CampaignRepository
  readonly sessions: {
    readonly find: (id: string, scope: AccountScope) => Promise<CampaignSession | null>
  }
  readonly contactGroups: {
    readonly hasGrant: (userId: string, id: string, scope: AccountScope) => Promise<boolean>
  }
  readonly authorize: (
    principal: CampaignPrincipal,
    sessionId: string,
    scope: AccountScope,
    action: "command",
  ) => Promise<{ readonly allowed: boolean }>
  readonly scheduler: {
    readonly schedule: (input: {
      readonly sessionId: string
      readonly accountScope: AccountScope
      readonly recipientPhone: string
      readonly message: string
      readonly scheduledFor: Date
      readonly timezone: string
      readonly idempotencyKey: string
    }) => Promise<{ readonly jobId: string; readonly duplicate: boolean }>
  }
  readonly wahaForSession: (session: CampaignSession) => Promise<
    Readonly<{
      readonly groups: (name: string) => Promise<readonly Readonly<{ readonly id: string }>[]>
      readonly sendText: (
        name: string,
        chatId: string,
        text: string,
      ) => Promise<{ readonly id: string }>
    }>
  >
  readonly now?: () => Date
}>

type CampaignSession = Readonly<{ id: string; accountScope: AccountScope; wahaSessionName: string }>

export function createCampaignService(dependencies: CampaignDependencies) {
  const now = dependencies.now ?? (() => new Date())
  return {
    async schedule(
      principal: CampaignPrincipal,
      input: CampaignScheduleInput,
    ): Promise<CampaignRecord> {
      const current = now()
      const effectiveScheduledAt = input.scheduledAt ?? new Date(current.getTime() + 5000)
      const effectiveTimezone = input.timezone ?? "Asia/Jakarta"
      if (effectiveScheduledAt <= current)
        throw new CampaignInputError("scheduledAt must be in the future")
      const decision = await dependencies.authorize(
        principal,
        input.sessionId,
        input.accountScope,
        "command",
      )
      if (!decision.allowed)
        throw new CampaignForbiddenError("session is not granted in this scope")
      if (
        !(await dependencies.contactGroups.hasGrant(
          principal.userId,
          input.contactGroupId,
          input.accountScope,
        ))
      )
        throw new CampaignForbiddenError("contact group is not granted in this scope")
      const session = await dependencies.sessions.find(input.sessionId, input.accountScope)
      if (!session) throw new CampaignForbiddenError("session is not in this scope")
      const groups = await (await dependencies.wahaForSession(session)).groups(
        session.wahaSessionName,
      )
      if (!groups.some((group) => group.id === input.wahaGroupId))
        throw new CampaignForbiddenError("WAHA group is not available in this session")
      const campaign = await dependencies.campaigns.create({
        accountScope: input.accountScope,
        sessionId: input.sessionId,
        contactGroupId: input.contactGroupId,
        wahaGroupId: input.wahaGroupId,
        message: input.message,
        ...(input.followUpMessage ? { followUpMessage: input.followUpMessage } : {}),
        trigger: input.trigger,
        scheduledAt: effectiveScheduledAt,
        createdBy: principal.userId,
      })
      const job = await dependencies.scheduler.schedule({
        sessionId: input.sessionId,
        accountScope: input.accountScope,
        recipientPhone: input.wahaGroupId,
        message: input.message,
        scheduledFor: effectiveScheduledAt,
        timezone: effectiveTimezone,
        idempotencyKey: `campaign:${campaign.id}`,
      })
      return (
        (await dependencies.campaigns.attachSchedulerJob(
          campaign.id,
          input.accountScope,
          job.jobId,
        )) ?? campaign
      )
    },
  }
}

export type CampaignScheduleInput = Readonly<{
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly contactGroupId: string
  readonly wahaGroupId: string
  readonly message: string
  readonly followUpMessage?: string | undefined
  readonly trigger: CampaignTrigger
  readonly scheduledAt?: Date | undefined
  readonly timezone?: string | undefined
}>

export function createCampaignTransport(
  dependencies: Readonly<{
    readonly wahaForSession: CampaignDependencies["wahaForSession"]
    readonly sessions: CampaignDependencies["sessions"]
    readonly campaigns: Pick<CampaignRepository, "markSent" | "markFailed">
  }>,
): (job: SchedulerJob) => Promise<DispatchResult> {
  return async (job) => {
    const campaignId = job.idempotencyKey.startsWith("campaign:")
      ? job.idempotencyKey.slice("campaign:".length)
      : null
    if (!campaignId)
      return { state: "failed", failureCode: "not_campaign", recoveryCode: "provider_rejected" }
    try {
      const session = await dependencies.sessions.find(job.sessionId, job.accountScope)
      if (!session)
        return {
          state: "failed",
          failureCode: "session_not_found",
          recoveryCode: "session_unavailable",
        }
      const context = await dependencies.wahaForSession(session)
      const sent = await context.sendText(
        session.wahaSessionName,
        job.recipientPhone.endsWith("@g.us") ? job.recipientPhone : `${job.recipientPhone}@g.us`,
        job.message,
      )
      await dependencies.campaigns.markSent(campaignId, job.accountScope)
      return { state: "submitted", providerMessageId: sent.id }
    } catch (error) {
      await dependencies.campaigns.markFailed(campaignId, job.accountScope)
      return classifyWahaDispatchError(error)
    }
  }
}
