import type { FastifyInstance } from "fastify"
import { z } from "zod"

import {
  MessagingInputError,
  type MessagingPrincipal,
  type ScheduleInput,
  type SendInput,
} from "./messaging"
import {
  authenticate,
  type SessionRouteAuth,
  sameOrigin,
  scopeQuerySchema,
  sessionParamsSchema,
} from "./waha/session-http-support"

type MessagingRouteService = {
  readonly resolveContact: (
    principal: MessagingPrincipal,
    sessionId: string,
    scope: "personal" | "business",
    target: { readonly phoneNumber: string } | { readonly contactId: string },
  ) => Promise<unknown>
  readonly sendImmediate: (principal: MessagingPrincipal, input: SendInput) => Promise<unknown>
  readonly scheduleText: (principal: MessagingPrincipal, input: ScheduleInput) => Promise<unknown>
  readonly setConsent: (
    principal: MessagingPrincipal,
    sessionId: string,
    scope: "personal" | "business",
    contactId: string,
    consentGranted: boolean,
    optedOut: boolean,
  ) => Promise<unknown>
}

const targetSchema = z.union([
  z.object({ phoneNumber: z.string().min(1).max(32) }),
  z.object({ contactId: z.string().uuid() }),
])
const sendSchema = targetSchema.and(
  z.object({ message: z.string().min(1).max(4096), idempotencyKey: z.string().uuid() }),
)
const scheduleSchema = sendSchema.and(
  z.object({ scheduledFor: z.coerce.date(), timezone: z.string().min(1).max(80) }),
)
const consentSchema = z.object({ consentGranted: z.boolean(), optedOut: z.boolean() })

export function registerMessagingRoutes(
  app: FastifyInstance,
  auth: SessionRouteAuth,
  service: MessagingRouteService,
): void {
  app.post("/scoped/sessions/:sessionId/contact", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const target = targetSchema.parse(request.body)
    try {
      return reply.send(await service.resolveContact(principal, sessionId, scope, target))
    } catch (error) {
      if (error instanceof MessagingInputError)
        return reply.code(400).send({ error: "invalid contact" })
      throw error
    }
  })

  app.post("/scoped/sessions/:sessionId/messages/immediate", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const parsedBody = sendSchema.safeParse(request.body)
    if (!parsedBody.success) return reply.code(400).send({ error: "invalid request" })
    const body = parsedBody.data
    return reply.send(
      await service.sendImmediate(principal, { ...body, sessionId, accountScope: scope }),
    )
  })

  app.post("/scoped/sessions/:sessionId/messages/schedule", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const parsedBody = scheduleSchema.safeParse(request.body)
    if (!parsedBody.success) return reply.code(400).send({ error: "invalid request" })
    const body = parsedBody.data
    return reply.send(
      await service.scheduleText(principal, { ...body, sessionId, accountScope: scope }),
    )
  })

  app.post("/scoped/sessions/:sessionId/contacts/:contactId/consent", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId, contactId } = z
      .object({ sessionId: z.string().uuid(), contactId: z.string().uuid() })
      .parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const consent = consentSchema.parse(request.body)
    return reply.send(
      await service.setConsent(
        principal,
        sessionId,
        scope,
        contactId,
        consent.consentGranted,
        consent.optedOut,
      ),
    )
  })
}
