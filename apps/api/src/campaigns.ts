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
  wahaGroupId: string | null
  wahaGroupSubject?: string | null
  trigger: unknown
  scheduledAt: Date
  state: "scheduled" | "sent" | "failed" | "cancelled"
  createdBy: string
  schedulerJobId: string | null
  followUpMessage: string | null
  messagePreview?: string | null
  timezone?: string | null
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
    readonly wahaGroupId: string | null
    readonly wahaGroupSubject: string | null
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
  readonly list: (
    scope: AccountScope,
    createdBy: string,
    pageSize: number,
    offset: number,
  ) => Promise<readonly CampaignRecord[]>
  readonly find: (id: string, scope: AccountScope) => Promise<CampaignRecord | null>
  readonly cancel: (id: string, scope: AccountScope) => Promise<CampaignRecord | null>
  readonly remove?: (id: string, scope: AccountScope) => Promise<boolean>
  readonly updateContactGroup: (
    id: string,
    scope: AccountScope,
    contactGroupId: string,
  ) => Promise<CampaignRecord | null>
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
    readonly cancel: (jobId: string, scope: AccountScope) => Promise<SchedulerJob | null>
  }
  readonly wahaForSession: (session: CampaignSession) => Promise<
    Readonly<{
      readonly groups: (name: string) => Promise<
        readonly Readonly<{
          readonly id: string
          readonly name?: string | undefined
          readonly subject?: string | undefined
        }>[]
      >
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
      let wahaGroupSubject: string | null = null
      if (input.wahaGroupId) {
        const groups = await (await dependencies.wahaForSession(session)).groups(
          session.wahaSessionName,
        )
        const group = groups.find((candidate) => candidate.id === input.wahaGroupId)
        if (!group) throw new CampaignForbiddenError("WAHA group is not available in this session")
        wahaGroupSubject = group.name ?? group.subject ?? null
      }
      const campaign = await dependencies.campaigns.create({
        accountScope: input.accountScope,
        sessionId: input.sessionId,
        contactGroupId: input.contactGroupId,
        wahaGroupId: input.wahaGroupId ?? null,
        wahaGroupSubject,
        message: input.message,
        ...(input.followUpMessage ? { followUpMessage: input.followUpMessage } : {}),
        trigger: input.trigger,
        scheduledAt: effectiveScheduledAt,
        createdBy: principal.userId,
      })
      const job = input.wahaGroupId
        ? await dependencies.scheduler.schedule({
            sessionId: input.sessionId,
            accountScope: input.accountScope,
            recipientPhone: input.wahaGroupId,
            message: input.message,
            scheduledFor: effectiveScheduledAt,
            timezone: effectiveTimezone,
            idempotencyKey: `campaign:${campaign.id}`,
          })
        : null
      if (!job) return campaign
      return (
        (await dependencies.campaigns.attachSchedulerJob(
          campaign.id,
          input.accountScope,
          job.jobId,
        )) ?? campaign
      )
    },
    async list(
      principal: CampaignPrincipal,
      scope: AccountScope,
      pageSize: number,
      offset: number,
    ): Promise<Readonly<{ items: readonly CampaignRecord[]; hasMore: boolean }>> {
      const items = await dependencies.campaigns.list(scope, principal.userId, pageSize + 1, offset)
      const hasMore = items.length > pageSize
      const paged = hasMore ? items.slice(0, pageSize) : items
      const filtered: CampaignRecord[] = []
      for (const campaign of paged) {
        const allowed = await dependencies.authorize(
          principal,
          campaign.sessionId,
          scope,
          "command",
        )
        if (allowed.allowed) filtered.push(campaign)
      }
      return { items: filtered, hasMore: hasMore && filtered.length === paged.length }
    },
    async find(
      principal: CampaignPrincipal,
      id: string,
      scope: AccountScope,
    ): Promise<CampaignRecord | null> {
      const campaign = await dependencies.campaigns.find(id, scope)
      if (!campaign || campaign.createdBy !== principal.userId) return null
      const allowed = await dependencies.authorize(principal, campaign.sessionId, scope, "command")
      if (!allowed.allowed) throw new CampaignForbiddenError("forbidden")
      return campaign
    },
    async cancel(
      principal: CampaignPrincipal,
      id: string,
      scope: AccountScope,
    ): Promise<CampaignRecord> {
      const campaign = await dependencies.campaigns.find(id, scope)
      if (!campaign || campaign.createdBy !== principal.userId)
        throw new CampaignForbiddenError("campaign not found")
      if (campaign.state === "cancelled") return campaign
      if (campaign.state !== "scheduled")
        throw new CampaignInputError("only scheduled campaigns can be cancelled")
      if (campaign.schedulerJobId) {
        const cancelled = await dependencies.scheduler.cancel(campaign.schedulerJobId, scope)
        if (!cancelled) throw new CampaignInputError("campaign is no longer cancellable")
      }
      const updated = await dependencies.campaigns.cancel(id, scope)
      if (!updated) {
        const current = await dependencies.campaigns.find(id, scope)
        if (current && current.createdBy === principal.userId && current.state === "cancelled")
          return current
        throw new CampaignInputError("only scheduled campaigns can be cancelled")
      }
      return updated
    },
    async remove(principal: CampaignPrincipal, id: string, scope: AccountScope): Promise<void> {
      const campaign = await dependencies.campaigns.find(id, scope)
      if (!campaign || campaign.createdBy !== principal.userId)
        throw new CampaignForbiddenError("campaign not found")
      if (campaign.state === "scheduled")
        throw new CampaignInputError("only terminal campaigns can be deleted")
      const removed = (await dependencies.campaigns.remove?.(id, scope)) ?? false
      if (!removed) throw new CampaignForbiddenError("campaign not found")
    },
    async updateContactGroup(
      principal: CampaignPrincipal,
      id: string,
      scope: AccountScope,
      contactGroupId: string,
    ): Promise<CampaignRecord> {
      const campaign = await dependencies.campaigns.find(id, scope)
      if (!campaign || campaign.createdBy !== principal.userId)
        throw new CampaignForbiddenError("campaign not found")
      if (!(await dependencies.contactGroups.hasGrant(principal.userId, contactGroupId, scope)))
        throw new CampaignForbiddenError("contact group is not granted in this scope")
      const updated = await dependencies.campaigns.updateContactGroup(id, scope, contactGroupId)
      if (!updated) throw new CampaignForbiddenError("campaign not found")
      return updated
    },
  }
}

export type CampaignScheduleInput = Readonly<{
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly contactGroupId: string
  readonly wahaGroupId?: string | undefined
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
