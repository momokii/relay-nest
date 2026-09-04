import type { FastifyInstance } from "fastify"
import { z } from "zod"

import type { AuthPrincipal, AuthService } from "./auth/service"
import {
  CampaignForbiddenError,
  CampaignInputError,
  type CampaignPrincipal,
  type CampaignRecord,
  type createCampaignService,
} from "./campaigns"
import { authenticate, csrfValid, sameOrigin, scopeQuerySchema } from "./waha/session-http-support"

const campaignBodySchema = z.object({
  sessionId: z.string().uuid(),
  contactGroupId: z.string().uuid(),
  wahaGroupId: z.string().min(1).max(256),
  message: z.string().trim().min(1).max(4096),
  followUpMessage: z.string().trim().min(1).max(4096).optional(),
  trigger: z.object({ type: z.string().min(1), emojiMap: z.record(z.string()).optional() }),
  scheduledAt: z.coerce.date().optional(),
  timezone: z.string().min(1).max(80).optional(),
})

const legacyBodySchema = campaignBodySchema.omit({ sessionId: true })
const campaignQuerySchema = z.object({
  scope: z.enum(["personal", "business"]),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
})
const campaignParamsSchema = z.object({ id: z.string().uuid() })
const PAGE_SIZE_CAP = 50

type CampaignRouteService = Pick<ReturnType<typeof createCampaignService>, "schedule"> & {
  readonly list?: (
    principal: CampaignPrincipal,
    scope: "personal" | "business",
    pageSize: number,
    offset: number,
  ) => Promise<Readonly<{ items: readonly CampaignRecord[]; hasMore: boolean }>>
  readonly find?: (
    principal: CampaignPrincipal,
    id: string,
    scope: "personal" | "business",
  ) => Promise<CampaignRecord | null>
  readonly cancel?: (
    principal: CampaignPrincipal,
    id: string,
    scope: "personal" | "business",
  ) => Promise<CampaignRecord>
}

type CampaignRouteAuth = Pick<AuthService, "authenticate" | "verifyCsrf">

function safeCampaign(campaign: CampaignRecord) {
  return {
    id: campaign.id,
    accountScope: campaign.accountScope,
    sessionId: campaign.sessionId,
    contactGroupId: campaign.contactGroupId,
    wahaGroupId: campaign.wahaGroupId,
    trigger: campaign.trigger,
    scheduledAt: campaign.scheduledAt,
    state: campaign.state,
    createdBy: campaign.createdBy,
    schedulerJobId: campaign.schedulerJobId,
  }
}

function unavailable(reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  return reply.code(503).send({ error: "campaigns unavailable" })
}

async function principalForMutation(
  auth: CampaignRouteAuth,
  request: Parameters<typeof authenticate>[1],
  reply: Parameters<typeof authenticate>[2],
): Promise<AuthPrincipal | null> {
  if (!sameOrigin(request)) {
    await reply.code(403).send({ error: "forbidden" })
    return null
  }
  const principal = await authenticate(auth, request, reply)
  if (!principal) return null
  if (!(await csrfValid(auth, principal, request))) {
    await reply.code(403).send({ error: "forbidden" })
    return null
  }
  return principal
}

export function registerCampaignRoutes(
  app: FastifyInstance,
  auth: CampaignRouteAuth,
  service: CampaignRouteService,
): void {
  app.get("/scoped/campaigns", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const parsed = campaignQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: "invalid request" })
    if (!service.list) return unavailable(reply)
    const query = parsed.data
    const pageSize = Math.min(query.pageSize, PAGE_SIZE_CAP)
    try {
      const result = await service.list(
        principal,
        query.scope,
        pageSize,
        (query.page - 1) * pageSize,
      )
      return reply.send({
        items: result.items.map(safeCampaign),
        page: query.page,
        pageSize,
        hasMore: result.hasMore,
      })
    } catch (error) {
      if (error instanceof CampaignForbiddenError)
        return reply.code(403).send({ error: "forbidden" })
      throw error
    }
  })

  app.post("/scoped/campaigns", async (request, reply) => {
    const principal = await principalForMutation(auth, request, reply)
    if (!principal) return
    const { scope } = scopeQuerySchema.parse(request.query)
    const parsed = campaignBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: "invalid request" })
    try {
      const campaign = await service.schedule(principal, {
        ...parsed.data,
        accountScope: scope,
        scheduledAt: parsed.data.scheduledAt,
      })
      return reply.code(201).send(safeCampaign(campaign))
    } catch (error) {
      if (error instanceof CampaignInputError)
        return reply.code(400).send({ error: "invalid request" })
      if (error instanceof CampaignForbiddenError)
        return reply.code(403).send({ error: "forbidden" })
      throw error
    }
  })

  app.get("/scoped/campaigns/:id", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { id } = campaignParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    if (!service.find) return unavailable(reply)
    try {
      const campaign = await service.find(principal, id, scope)
      if (!campaign) return reply.code(403).send({ error: "forbidden" })
      return reply.send(safeCampaign(campaign))
    } catch (error) {
      if (error instanceof CampaignForbiddenError)
        return reply.code(403).send({ error: "forbidden" })
      throw error
    }
  })

  app.post("/scoped/campaigns/:id/cancel", async (request, reply) => {
    const principal = await principalForMutation(auth, request, reply)
    if (!principal) return
    const { id } = campaignParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    if (!service.cancel) return unavailable(reply)
    try {
      return reply.send(safeCampaign(await service.cancel(principal, id, scope)))
    } catch (error) {
      if (error instanceof CampaignForbiddenError)
        return reply.code(403).send({ error: "forbidden" })
      throw error
    }
  })

  app.post("/scoped/sessions/:sessionId/campaigns", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (!(await csrfValid(auth, principal, request)))
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const parsed = legacyBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: "invalid request" })
    try {
      const campaign = await service.schedule(
        principal,
        parsed.data.followUpMessage === undefined
          ? { ...parsed.data, sessionId, accountScope: scope }
          : {
              ...parsed.data,
              followUpMessage: parsed.data.followUpMessage,
              sessionId,
              accountScope: scope,
            },
      )
      return reply.code(201).send({
        id: campaign.id,
        accountScope: campaign.accountScope,
        sessionId: campaign.sessionId,
        contactGroupId: campaign.contactGroupId,
        wahaGroupId: campaign.wahaGroupId,
        trigger: campaign.trigger,
        scheduledAt: campaign.scheduledAt,
        state: campaign.state,
        schedulerJobId: campaign.schedulerJobId,
      })
    } catch (error) {
      if (error instanceof CampaignInputError)
        return reply.code(400).send({ error: "invalid request" })
      if (error instanceof CampaignForbiddenError)
        return reply.code(403).send({ error: "forbidden" })
      throw error
    }
  })
}
