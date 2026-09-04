import type { FastifyInstance } from "fastify"
import { z } from "zod"

import {
  authenticate,
  confirmPasskey,
  lifecycleSchema,
  pairingSchema,
  readSurface,
  type SessionRouteAuth,
  type SessionService,
  sameOrigin,
  scopeQuerySchema,
  sendService,
  sessionBodySchema,
  sessionParamsSchema,
  submitPasskey,
} from "./session-http-support"

export type { SessionRouteAuth } from "./session-http-support"

export function registerSessionRoutes(
  app: FastifyInstance,
  auth: SessionRouteAuth,
  service: SessionService,
): void {
  app.get("/scoped/sessions", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { scope } = scopeQuerySchema.parse(request.query)
    return sendService(reply, () => service.list(principal, scope))
  })

  app.post("/scoped/sessions", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { scope } = scopeQuerySchema.parse(request.query)
    const body = sessionBodySchema.parse(request.body)
    const input = z
      .object({
        connectionId: z.string().uuid(),
        name: z.string().min(1).max(120),
        wahaSessionName: z.string().min(1).max(120),
        status: z.string().optional(),
      })
      .parse(body)
    return sendService(reply, () =>
      service.create(principal, scope, input, JSON.stringify({ name: input.wahaSessionName })),
    )
  })

  app.get("/scoped/sessions/:sessionId", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    return sendService(reply, () => service.get(principal, sessionId, scope))
  })

  app.post("/scoped/sessions/:sessionId/lifecycle", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const input = lifecycleSchema.parse(request.body)
    return sendService(reply, () =>
      service.lifecycle(principal, sessionId, scope, input.action, input.confirmed),
    )
  })

  app.put("/scoped/sessions/:sessionId", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const body = sessionBodySchema.parse(request.body)
    return sendService(reply, () =>
      service.update(principal, sessionId, scope, JSON.stringify(body)),
    )
  })

  app.get("/scoped/sessions/:sessionId/metadata", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.metadata(principal, sessionId, scope),
    ),
  )
  app.get("/scoped/sessions/:sessionId/status-history", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.history(principal, sessionId, scope),
    ),
  )
  app.get("/scoped/sessions/:sessionId/chats", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.chats(principal, sessionId, scope),
    ),
  )
  app.get("/scoped/sessions/:sessionId/groups", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.groups(principal, sessionId, scope),
    ),
  )
  app.get("/scoped/sessions/:sessionId/chats/:chatRef/messages", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { sessionId, chatRef } = z
      .object({ sessionId: z.string().uuid(), chatRef: z.string().min(1) })
      .parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    return sendService(reply, () => service.messages(principal, sessionId, scope, chatRef))
  })
  app.get(
    "/scoped/sessions/:sessionId/chats/:chatRef/messages/:messageId/media",
    async (request, reply) => {
      const principal = await authenticate(auth, request, reply)
      if (!principal) return
      const { sessionId, chatRef, messageId } = z
        .object({
          sessionId: z.string().uuid(),
          chatRef: z.string().min(1),
          messageId: z.string().min(1),
        })
        .parse(request.params)
      const { scope } = scopeQuerySchema.parse(request.query)
      try {
        const file = await service.messageMedia(principal, sessionId, scope, chatRef, messageId)
        reply.header("content-type", file.contentType ?? "application/octet-stream")
        reply.header("cache-control", "private, max-age=3600")
        return reply.send(Buffer.from(file.buffer))
      } catch (error) {
        const { ScopedSessionError } = await import("./sessions")
        const { WahaHttpError } = await import("./errors")
        if (error instanceof ScopedSessionError) {
          const status = error.code === "forbidden" || error.code === "role_denied" ? 403 : 409
          return reply.code(status).send({ error: error.code })
        }
        if (error instanceof WahaHttpError) {
          return reply.code(502).send({ error: "WAHA unavailable" })
        }
        return reply.code(502).send({ error: "WAHA unavailable" })
      }
    },
  )
  app.get("/scoped/sessions/:sessionId/qr", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.qr(principal, sessionId, scope),
    ),
  )
  app.get("/scoped/sessions/:sessionId/timelock", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.timelock(principal, sessionId, scope),
    ),
  )
  app.get("/scoped/sessions/:sessionId/capping", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.capping(principal, sessionId, scope),
    ),
  )

  app.post("/scoped/sessions/:sessionId/pairing-code", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (
      !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
    )
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const { phoneNumber } = pairingSchema.parse(request.body)
    return sendService(reply, async () => {
      await service.requestPairingCode(principal, sessionId, scope, phoneNumber)
      return { accepted: true }
    })
  })

  app.get("/scoped/sessions/:sessionId/auth/passkey/challenge", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.passkeyChallenge(principal, sessionId, scope),
    ),
  )
  app.post("/scoped/sessions/:sessionId/auth/passkey", async (request, reply) =>
    submitPasskey(auth, service, request, reply),
  )
  app.get("/scoped/sessions/:sessionId/auth/passkey/confirmation", async (request, reply) =>
    readSurface(auth, request, reply, (principal, sessionId, scope) =>
      service.passkeyConfirmation(principal, sessionId, scope),
    ),
  )
  app.post("/scoped/sessions/:sessionId/auth/passkey/confirm", async (request, reply) =>
    confirmPasskey(auth, service, request, reply),
  )
}
