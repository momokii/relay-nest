import type { FastifyInstance } from "fastify"
import { z } from "zod"

import type { SessionRouteAuth } from "../waha/session-http-support"
import { authenticate, csrfValid, sameOrigin, scopeSchema } from "../waha/session-http-support"
import { AiApprovalAuthorizationError } from "./service"
import type { AiApprovalService } from "./types"

const paramsSchema = z.object({ suggestionId: z.string().trim().min(1).max(128) })
const approvalSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  kind: z.enum(["summary", "classification", "draft"]),
  approved: z.literal(true),
})
const querySchema = z.object({ scope: scopeSchema })

export function registerAiApprovalRoutes(
  app: FastifyInstance,
  auth: SessionRouteAuth,
  service: AiApprovalService,
): void {
  app.post("/scoped/ai/suggestions/:suggestionId/approve", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (!(await csrfValid(auth, principal, request)))
      return reply.code(403).send({ error: "forbidden" })
    try {
      const { suggestionId } = paramsSchema.parse(request.params)
      const { scope } = querySchema.parse(request.query)
      return reply.send(
        service.approve(principal, {
          suggestionId,
          accountScope: scope,
          ...approvalSchema.parse(request.body),
        }),
      )
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: "invalid request" })
      if (error instanceof AiApprovalAuthorizationError)
        return reply.code(403).send({ error: "forbidden" })
      throw error
    }
  })
}
