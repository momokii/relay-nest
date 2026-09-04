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

  app.get("/scoped/contact-groups/:groupId/members", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { groupId } = z.object({ groupId: z.string().uuid() }).parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    try {
      const members = await repository.listMembers(principal.userId, scope, groupId)
      return reply.send(members)
    } catch {
      return reply.code(403).send({ error: "forbidden" })
    }
  })

  app.post("/scoped/contact-groups/:groupId/members", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (!(await csrfValid(auth, principal, request))) return reply.code(403).send({ error: "forbidden" })
    const { groupId } = z.object({ groupId: z.string().uuid() }).parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    const parsed = z.object({ phone: z.string().min(8).max(20).optional(), contactId: z.string().uuid().optional() }).safeParse(request.body)
    if (!parsed.success || (!parsed.data.phone && !parsed.data.contactId)) return reply.code(400).send({ error: "invalid request" })
    try {
      const member = await repository.addMember(principal.userId, scope, groupId, parsed.data.phone ? { phone: parsed.data.phone } : { contactId: parsed.data.contactId as string })
      return reply.code(201).send(member)
    } catch {
      return reply.code(403).send({ error: "forbidden" })
    }
  })

  app.delete("/scoped/contact-groups/:groupId/members/:memberId", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (!(await csrfValid(auth, principal, request))) return reply.code(403).send({ error: "forbidden" })
    const { groupId, memberId } = z.object({ groupId: z.string().uuid(), memberId: z.string().uuid() }).parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    try {
      const ok = await repository.removeMember(principal.userId, scope, groupId, memberId)
      if (!ok) return reply.code(404).send({ error: "not found" })
      return reply.send({ ok: true })
    } catch {
      return reply.code(403).send({ error: "forbidden" })
    }
  })
}
