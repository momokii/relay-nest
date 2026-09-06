import { createEnvelopeCipher, type EncryptedEnvelope } from "@waha-command-center/config"
import { and, desc, eq, inArray } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { campaigns, scheduledJobs } from "../schema"
import type { AccountScope } from "../schema/shared"

const MESSAGE_PREVIEW_LIMIT = 120

export type CampaignRecord = {
  readonly id: string
  readonly accountScope: AccountScope
  readonly sessionId: string
  readonly contactGroupId: string
  readonly wahaGroupId: string | null
  readonly wahaGroupSubject: string | null
  readonly trigger: unknown
  readonly scheduledAt: Date
  readonly state: "scheduled" | "sent" | "failed" | "cancelled"
  readonly createdBy: string
  readonly schedulerJobId: string | null
  readonly followUpMessage: string | null
  readonly messagePreview: string | null
  readonly timezone: string | null
}

export function createCampaignRepository(db: PersistenceDatabase, masterKey: Buffer | undefined) {
  const cipher = createEnvelopeCipher(masterKey)
  const envelope = (value: string, scope: AccountScope): EncryptedEnvelope =>
    cipher.encrypt(value, { accountScope: scope })
  const truncatePreview = (plaintext: string): string =>
    plaintext.length > MESSAGE_PREVIEW_LIMIT ? plaintext.slice(0, MESSAGE_PREVIEW_LIMIT) : plaintext
  // Security: preview plaintext exists only in memory; never log or persist envelope material.
  const safe = (
    row: typeof campaigns.$inferSelect,
    timezone: string | null = null,
  ): CampaignRecord => ({
    id: row.id,
    accountScope: row.accountScope,
    sessionId: row.sessionId,
    contactGroupId: row.contactGroupId,
    wahaGroupId: row.wahaGroupId,
    wahaGroupSubject: row.wahaGroupSubject,
    trigger: row.trigger,
    scheduledAt: row.scheduledAt,
    state: row.state,
    createdBy: row.createdBy,
    schedulerJobId: row.schedulerJobId,
    followUpMessage:
      row.followUpMessageCiphertext && row.followUpMessageNonce && row.followUpMessageAuthTag
        ? cipher.decrypt(
            {
              version: 1,
              algorithm: "aes-256-gcm",
              ciphertext: row.followUpMessageCiphertext,
              nonce: row.followUpMessageNonce,
              authTag: row.followUpMessageAuthTag,
            },
            { accountScope: row.accountScope },
          )
        : null,
    messagePreview: truncatePreview(
      cipher.decrypt(
        {
          version: 1,
          algorithm: "aes-256-gcm",
          ciphertext: row.messageCiphertext,
          nonce: row.messageNonce,
          authTag: row.messageAuthTag,
        },
        { accountScope: row.accountScope },
      ),
    ),
    timezone,
  })
  return {
    create: async (input: {
      readonly accountScope: AccountScope
      readonly sessionId: string
      readonly contactGroupId: string
      readonly wahaGroupId: string | null
      readonly wahaGroupSubject: string | null
      readonly message: string
      readonly followUpMessage?: string | undefined
      readonly trigger: unknown
      readonly scheduledAt: Date
      readonly createdBy: string
    }) => {
      const message = envelope(input.message, input.accountScope)
      const followUp = input.followUpMessage
        ? envelope(input.followUpMessage, input.accountScope)
        : null
      const [row] = await db
        .insert(campaigns)
        .values({
          accountScope: input.accountScope,
          sessionId: input.sessionId,
          contactGroupId: input.contactGroupId,
          wahaGroupId: input.wahaGroupId,
          wahaGroupSubject: input.wahaGroupSubject,
          messageCiphertext: message.ciphertext,
          messageNonce: message.nonce,
          messageAuthTag: message.authTag,
          followUpMessageCiphertext: followUp?.ciphertext,
          followUpMessageNonce: followUp?.nonce,
          followUpMessageAuthTag: followUp?.authTag,
          trigger: input.trigger,
          scheduledAt: input.scheduledAt,
          createdBy: input.createdBy,
        })
        .returning()
      if (!row) throw new Error("campaign persistence returned no row")
      return safe(row)
    },
    find: async (id: string, accountScope: AccountScope) => {
      const [result] = await db
        .select({ campaign: campaigns, timezone: scheduledJobs.timezone })
        .from(campaigns)
        .leftJoin(scheduledJobs, eq(campaigns.schedulerJobId, scheduledJobs.id))
        .where(and(eq(campaigns.id, id), eq(campaigns.accountScope, accountScope)))
        .limit(1)
      return result ? safe(result.campaign, result.timezone) : null
    },
    list: async (
      accountScope: AccountScope,
      createdBy: string,
      pageSize: number,
      offset: number,
    ) => {
      const results = await db
        .select({ campaign: campaigns, timezone: scheduledJobs.timezone })
        .from(campaigns)
        .leftJoin(scheduledJobs, eq(campaigns.schedulerJobId, scheduledJobs.id))
        .where(and(eq(campaigns.accountScope, accountScope), eq(campaigns.createdBy, createdBy)))
        .orderBy(desc(campaigns.createdAt))
        .limit(pageSize)
        .offset(offset)
      return results.map((result) => safe(result.campaign, result.timezone))
    },
    cancel: async (id: string, accountScope: AccountScope) => {
      const [row] = await db
        .update(campaigns)
        .set({ state: "cancelled" })
        .where(
          and(
            eq(campaigns.id, id),
            eq(campaigns.accountScope, accountScope),
            eq(campaigns.state, "scheduled"),
          ),
        )
        .returning()
      return row ? safe(row) : null
    },
    updateContactGroup: async (id: string, accountScope: AccountScope, contactGroupId: string) => {
      const [row] = await db
        .update(campaigns)
        .set({ contactGroupId })
        .where(and(eq(campaigns.id, id), eq(campaigns.accountScope, accountScope)))
        .returning()
      return row ? safe(row) : null
    },
    listForReaction: async (
      accountScope: AccountScope,
      sessionId: string,
      wahaGroupId?: string,
    ) => {
      const rows = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.accountScope, accountScope),
            eq(campaigns.sessionId, sessionId),
            eq(campaigns.state, "sent"),
            ...(wahaGroupId ? [eq(campaigns.wahaGroupId, wahaGroupId)] : []),
          ),
        )
      return rows.map((row) => safe(row))
    },
    attachSchedulerJob: async (id: string, accountScope: AccountScope, schedulerJobId: string) => {
      const [row] = await db
        .update(campaigns)
        .set({ schedulerJobId })
        .where(and(eq(campaigns.id, id), eq(campaigns.accountScope, accountScope)))
        .returning()
      if (!row) return null
      const [job] = await db
        .select({ timezone: scheduledJobs.timezone })
        .from(scheduledJobs)
        .where(eq(scheduledJobs.id, schedulerJobId))
        .limit(1)
      return safe(row, job?.timezone ?? null)
    },
    markSent: (id: string, accountScope: AccountScope) =>
      db
        .update(campaigns)
        .set({ state: "sent" })
        .where(and(eq(campaigns.id, id), eq(campaigns.accountScope, accountScope))),
    markFailed: (id: string, accountScope: AccountScope) =>
      db
        .update(campaigns)
        .set({ state: "failed" })
        .where(and(eq(campaigns.id, id), eq(campaigns.accountScope, accountScope))),
    remove: async (id: string, accountScope: AccountScope) => {
      const rows = await db
        .delete(campaigns)
        .where(
          and(
            eq(campaigns.id, id),
            eq(campaigns.accountScope, accountScope),
            inArray(campaigns.state, ["cancelled", "sent", "failed"]),
          ),
        )
        .returning({ id: campaigns.id })
      return rows.length > 0
    },
  }
}
