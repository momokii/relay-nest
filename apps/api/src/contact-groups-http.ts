import type { FastifyInstance } from "fastify"
import { z } from "zod"

import type { AuthService } from "./auth/service"
import type { ContactGroupRepository } from "./contact-groups-types"
import { authenticate, csrfValid, sameOrigin, scopeQuerySchema } from "./waha/session-http-support"

const contactGroupBodySchema = z.object({ name: z.string().trim().min(1).max(120) })

type ContactGroupsRouteAuth = Pick<AuthService, "authenticate" | "verifyCsrf">

export function registerContactGroupsRoutes(
  app: FastifyInstance,
  auth: ContactGroupsRouteAuth,
  repository: ContactGroupRepository,
): void {
  app.get("/scoped/contact-groups", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { scope } = scopeQuerySchema.parse(request.query)
    try {
      const groups = await repository.list(principal.userId, scope)
      return reply.send(groups)
    } catch {
      return reply.code(403).send({ error: "forbidden" })
    }
  })

  app.post("/scoped/contact-groups", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (!(await csrfValid(auth, principal, request))) return reply.code(403).send({ error: "forbidden" })
    const { scope } = scopeQuerySchema.parse(request.query)
    const parsed = contactGroupBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: "invalid request" })
    try {
      const group = await repository.create({
        userId: principal.userId,
        accountScope: scope,
        name: parsed.data.name,
      })
      return reply.code(201).send(group)
    } catch {
      return reply.code(403).send({ error: "forbidden" })
    }
  })
}
