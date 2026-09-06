import { z } from "zod"
import { type ApiResult, requestJson } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"

const triggerSchema = z.object({ type: z.string(), emojiMap: z.record(z.string()).optional() })
const campaignStateSchema = z.enum(["scheduled", "sent", "failed", "cancelled"])
const campaignSchema = z.object({
  id: z.string(),
  accountScope: z.enum(["personal", "business"]),
  sessionId: z.string(),
  contactGroupId: z.string(),
  wahaGroupId: z.string().nullable(),
  wahaGroupSubject: z.string().nullable(),
  trigger: triggerSchema,
  scheduledAt: z.string(),
  state: campaignStateSchema,
  createdBy: z.string().optional(),
  schedulerJobId: z.string().nullable().optional(),
  messagePreview: z.string().nullable(),
  timezone: z.string().nullable(),
})
const pageSchema = z.object({
  items: z.array(campaignSchema),
  page: z.number(),
  pageSize: z.number(),
  hasMore: z.boolean(),
})
const contactGroupSchema = z.object({
  id: z.string(),
  accountScope: z.enum(["personal", "business"]),
  name: z.string(),
})
const wahaGroupSchema = z.object({
  id: z.string(),
  subject: z.string().optional(),
  name: z.string().optional(),
  participants: z.array(z.string()).optional(),
})
const contactGroupMemberSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  contactId: z.string().nullable(),
  phone: z.string().nullable(),
  accountScope: z.enum(["personal", "business"]),
})

export type Campaign = z.infer<typeof campaignSchema>
export type CampaignState = z.infer<typeof campaignStateSchema>
export type ContactGroup = z.infer<typeof contactGroupSchema>
export type WahaGroup = z.infer<typeof wahaGroupSchema>
export type ContactGroupMember = z.infer<typeof contactGroupMemberSchema>

const TERMINAL_CAMPAIGN_STATES: readonly CampaignState[] = ["sent", "failed", "cancelled"]

export function isTerminal(campaign: Pick<Campaign, "state">): boolean {
  return TERMINAL_CAMPAIGN_STATES.includes(campaign.state)
}

export function campaignTitle(
  campaign: Pick<Campaign, "wahaGroupSubject" | "wahaGroupId">,
): string {
  const subject = campaign.wahaGroupSubject?.trim()
  return subject ? subject : campaign.wahaGroupId || "Custom group"
}

export type CampaignInput = Readonly<{
  sessionId: string
  contactGroupId: string
  wahaGroupId?: string | undefined
  message: string
  followUpMessage?: string
  trigger: { type: "any" | "emoji"; emojiMap?: Record<string, string> }
  scheduledAt?: string | undefined
  timezone?: string | undefined
}>

export type CampaignApi = Readonly<{
  list: (scope: AccountScope) => Promise<ApiResult<readonly Campaign[]>>
  create: (scope: AccountScope, input: CampaignInput) => Promise<ApiResult<Campaign>>
  cancel: (scope: AccountScope, id: string) => Promise<ApiResult<Campaign>>
  remove: (scope: AccountScope, id: string) => Promise<ApiResult<{ ok: boolean }>>
  updateContactGroup: (
    scope: AccountScope,
    id: string,
    contactGroupId: string,
  ) => Promise<ApiResult<Campaign>>
  contactGroups: (scope: AccountScope) => Promise<ApiResult<readonly ContactGroup[]>>
  createContactGroup: (scope: AccountScope, name: string) => Promise<ApiResult<ContactGroup>>
  deleteContactGroup: (scope: AccountScope, groupId: string) => Promise<ApiResult<{ ok: boolean }>>
  contactGroupMembers: (
    scope: AccountScope,
    groupId: string,
  ) => Promise<ApiResult<readonly ContactGroupMember[]>>
  addContactGroupMember: (
    scope: AccountScope,
    groupId: string,
    phone: string,
  ) => Promise<ApiResult<ContactGroupMember>>
  removeContactGroupMember: (
    scope: AccountScope,
    groupId: string,
    memberId: string,
  ) => Promise<ApiResult<{ ok: boolean }>>
  wahaGroups: (scope: AccountScope, sessionId: string) => Promise<ApiResult<readonly WahaGroup[]>>
}>

export function createCampaignApi(baseUrl = ""): CampaignApi {
  const root = baseUrl.replace(/\/$/, "")
  const scoped = (path: string, scope: AccountScope): string => `${root}${path}?scope=${scope}`
  return {
    list: async (scope) => {
      const result = await requestJson(scoped("/scoped/campaigns", scope), pageSchema)
      return result.kind === "ready" ? { kind: "ready", data: result.data.items } : result
    },
    create: (scope, input) =>
      requestJson(scoped("/scoped/campaigns", scope), campaignSchema, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateContactGroup: (scope, id, contactGroupId) =>
      requestJson(scoped(`/scoped/campaigns/${id}`, scope), campaignSchema, {
        method: "PATCH",
        body: JSON.stringify({ contactGroupId }),
      }),
    cancel: (scope, id) =>
      requestJson(scoped(`/scoped/campaigns/${id}/cancel`, scope), campaignSchema, {
        method: "POST",
      }),
    remove: (scope, id) =>
      requestJson(scoped(`/scoped/campaigns/${id}`, scope), z.object({ ok: z.boolean() }), {
        method: "DELETE",
      }),
    contactGroups: async (scope) => {
      const result = await requestJson(
        scoped("/scoped/contact-groups", scope),
        z.array(contactGroupSchema),
      )
      return result
    },
    createContactGroup: (scope, name) =>
      requestJson(scoped("/scoped/contact-groups", scope), contactGroupSchema, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    deleteContactGroup: (scope, groupId) =>
      requestJson(
        scoped(`/scoped/contact-groups/${groupId}`, scope),
        z.object({ ok: z.boolean() }),
        {
          method: "DELETE",
        },
      ),
    contactGroupMembers: (scope, groupId) =>
      requestJson(
        scoped(`/scoped/contact-groups/${groupId}/members`, scope),
        z.array(contactGroupMemberSchema),
      ),
    addContactGroupMember: (scope, groupId, phone) =>
      requestJson(
        scoped(`/scoped/contact-groups/${groupId}/members`, scope),
        contactGroupMemberSchema,
        {
          method: "POST",
          body: JSON.stringify({ phone }),
        },
      ),
    removeContactGroupMember: (scope, groupId, memberId) =>
      requestJson(
        scoped(`/scoped/contact-groups/${groupId}/members/${memberId}`, scope),
        z.object({ ok: z.boolean() }),
        {
          method: "DELETE",
        },
      ),
    wahaGroups: async (scope, sessionId) =>
      requestJson(scoped(`/scoped/sessions/${sessionId}/groups`, scope), z.array(wahaGroupSchema)),
  }
}
