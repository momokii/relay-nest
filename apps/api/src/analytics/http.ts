import type { FastifyInstance } from "fastify"
import { z } from "zod"

import {
  authenticate,
  type SessionRouteAuth,
  sameOrigin,
  scopeSchema,
} from "../waha/session-http-support"
import type { AnalyticsService } from "./service"
import { AnalyticsAuthorizationError } from "./service"

const MAX_ANALYTICS_WINDOW_MS = 366 * 24 * 60 * 60 * 1000

const analyticsQuerySchema = z
  .object({
    scope: scopeSchema,
    sessionId: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((query, context) => {
    if (query.from && query.to && new Date(query.from) >= new Date(query.to)) {
      context.addIssue({ code: "custom", path: ["to"], message: "to must be after from" })
    }
  })

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  auth: SessionRouteAuth,
  service: AnalyticsService,
): void {
  app.get("/scoped/analytics", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const query = analyticsQuerySchema.parse(request.query)
    const now = new Date()
    const window = {
      from: query.from ? new Date(query.from) : new Date(now.getTime() - MAX_ANALYTICS_WINDOW_MS),
      to: query.to ? new Date(query.to) : now,
    }
    if (window.to.getTime() - window.from.getTime() > MAX_ANALYTICS_WINDOW_MS)
      return reply.code(400).send({ error: "invalid request" })
    try {
      return reply.send(await service.read(principal, query.scope, window, query.sessionId))
    } catch (error) {
      if (error instanceof AnalyticsAuthorizationError)
        return reply.code(403).send({ error: "forbidden" })
      throw error
    }
  })
}
