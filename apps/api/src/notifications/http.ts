import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"

import type { AdminService } from "../auth/admin"
import type { AuthPrincipal, AuthService } from "../auth/service"
import { NOTIFICATION_CATEGORIES } from "./contracts"
import type { NotificationService } from "./service"

const scopeSchema = z.enum(["personal", "business"])
const paramsSchema = z.object({ accountScope: scopeSchema })
const settingsSchema = z.object({
  email: z.object({
    enabled: z.boolean(),
    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65_535),
    secure: z.literal(true),
    username: z.string().min(1).max(320),
    password: z.string().min(1).max(512),
    from: z.string().email().max(320),
  }),
  telegram: z.object({
    enabled: z.boolean(),
    botToken: z.string().min(1).max(512),
    chatIds: z.array(z.string().min(1).max(128)).min(1).max(100),
  }),
})
const preferencesSchema = z.object({
  security: z.object({ email: z.boolean(), telegram: z.boolean() }),
  delivery: z.object({ email: z.boolean(), telegram: z.boolean() }),
  operations: z.object({ email: z.boolean(), telegram: z.boolean() }),
})

export function registerNotificationRoutes(
  app: FastifyInstance,
  auth: AuthService,
  admin: AdminService,
  service: NotificationService,
): void {
  app.get("/admin/notifications/:accountScope/settings", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    if (!(await admin.canManage(principal.userId, accountScope))) return forbidden(reply)
    return reply.send(await service.readSettings(accountScope))
  })

  app.put("/admin/notifications/:accountScope/settings", async (request, reply) => {
    if (!sameOrigin(request)) return forbidden(reply)
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    if (
      !(await admin.canManage(principal.userId, accountScope)) ||
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return forbidden(reply)
    const body = settingsSchema.parse(request.body)
    return reply.send(
      await service.saveSettings(principal.userId, {
        accountScope,
        ...body,
      }),
    )
  })

  app.put("/admin/notifications/:accountScope/preferences", async (request, reply) => {
    if (!sameOrigin(request)) return forbidden(reply)
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    if (
      !(await admin.canManage(principal.userId, accountScope)) ||
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return forbidden(reply)
    const body = preferencesSchema.parse(request.body)
    await service.savePreferences(accountScope, body)
    return reply.code(204).send()
  })

  app.post("/admin/notifications/:accountScope/test", async (request, reply) => {
    if (!sameOrigin(request)) return forbidden(reply)
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    if (
      !(await admin.canManage(principal.userId, accountScope)) ||
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return forbidden(reply)
    const body = z
      .object({ category: z.enum(NOTIFICATION_CATEGORIES).default("operations") })
      .parse(request.body ?? {})
    return reply.send(await service.sendTest(principal.userId, accountScope, body.category))
  })

  app.get("/admin/notifications/:accountScope/history", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    if (!(await admin.canManage(principal.userId, accountScope))) return forbidden(reply)
    const limit = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
      .parse(request.query).limit
    return reply.send(await service.listHistory(accountScope, limit))
  })
}

async function authenticate(
  auth: AuthService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthPrincipal | null> {
  const token = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("waha_session="))
    ?.slice("waha_session=".length)
  const principal = await auth.authenticate(token)
  if (!principal) {
    await reply.code(401).send({ error: "unauthenticated" })
    return null
  }
  return principal
}

function sameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin
  return (
    !origin ||
    origin === `http://${request.headers.host}` ||
    origin === `https://${request.headers.host}`
  )
}

function forbidden(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({ error: "forbidden" })
}
