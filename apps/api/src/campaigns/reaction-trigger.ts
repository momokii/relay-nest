import { z } from "zod"

import type { AccountScope } from "../db/schema/shared"
import type { SendResult } from "../messaging"

export const reactionEventSchema = z.object({
  sessionId: z.string().min(1),
  accountScope: z.enum(["personal", "business"]),
  reactionMessageId: z.string().min(1),
  participant: z.string().min(1),
  sourceMessageId: z.string().min(1),
  wahaGroupId: z.string().min(1).optional(),
})
export type ReactionEvent = z.infer<typeof reactionEventSchema>

type Campaign = Readonly<{
  readonly id: string
  readonly accountScope: AccountScope
  readonly sessionId: string
  readonly contactGroupId: string
  readonly followUpMessage: string | null
  readonly createdBy: string
}>

type ReactionTriggerDependencies = Readonly<{
  readonly campaigns: {
    readonly listForReaction: (
      accountScope: AccountScope,
      sessionId: string,
      wahaGroupId?: string,
    ) => Promise<readonly Campaign[]>
  }
  readonly contactGroups: {
    readonly hasMember: (
      accountScope: AccountScope,
      sessionId: string,
      groupId: string,
      phone: string,
    ) => Promise<boolean>
  }
  readonly messaging: {
    readonly sendImmediate: (
      principal: {
        readonly userId: string
        readonly roles: readonly ("admin" | "operator" | "viewer")[]
      },
      input: {
        readonly sessionId: string
        readonly accountScope: AccountScope
        readonly phoneNumber: string
        readonly message: string
        readonly idempotencyKey: string
      },
    ) => Promise<SendResult>
  }
  readonly audit: (input: {
    readonly actorUserId: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: AccountScope
    readonly sessionId: string
  }) => Promise<void>
}>

export function createReactionTrigger(dependencies: ReactionTriggerDependencies) {
  const handled = new Set<string>()

  return async function handle(event: ReactionEvent): Promise<readonly SendResult[]> {
    const campaigns = await dependencies.campaigns.listForReaction(
      event.accountScope,
      event.sessionId,
      event.wahaGroupId,
    )
    const results: SendResult[] = []
    for (const campaign of campaigns) {
      if (!campaign.followUpMessage) continue
      const dedupeKey = `campaign:${campaign.id}:reaction:${event.participant}:${event.reactionMessageId}`
      if (handled.has(dedupeKey)) continue
      handled.add(dedupeKey)
      const member = await dependencies.contactGroups.hasMember(
        event.accountScope,
        event.sessionId,
        campaign.contactGroupId,
        event.participant,
      )
      if (!member) {
        await dependencies.audit({
          actorUserId: campaign.createdBy,
          action: "campaign.reaction_non_member",
          subjectType: "campaign",
          subjectId: campaign.id,
          accountScope: event.accountScope,
          sessionId: event.sessionId,
        })
        continue
      }
      const result = await dependencies.messaging.sendImmediate(
        { userId: campaign.createdBy, roles: ["operator"] },
        {
          sessionId: event.sessionId,
          accountScope: event.accountScope,
          phoneNumber: event.participant.replace(/@(c\.us|lid)$/, "").replace(/^/, "+"),
          message: campaign.followUpMessage,
          idempotencyKey: dedupeKey,
        },
      )
      results.push(result)
      await dependencies.audit({
        actorUserId: campaign.createdBy,
        action: `campaign.reaction_follow_up_${result.state}`,
        subjectType: "campaign",
        subjectId: campaign.id,
        accountScope: event.accountScope,
        sessionId: event.sessionId,
      })
    }
    return results
  }
}
