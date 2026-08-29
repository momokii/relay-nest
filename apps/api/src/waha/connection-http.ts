import type { FastifyInstance, FastifyRequest } from "fastify"

import type { AuthPrincipal } from "../auth/service"

export type ConnectionRouteRepositories = {
  readonly wahaConnections: {
    readonly listActive: () => Promise<
      readonly {
        readonly id: string
        readonly name: string
        readonly baseUrl: string
      }[]
    >
  }
}

export type ConnectionRouteAuth = {
  readonly authenticate: (token: string | undefined) => Promise<AuthPrincipal | null>
}

export function registerConnectionRoutes(
  app: FastifyInstance,
  auth: ConnectionRouteAuth,
  repositories: ConnectionRouteRepositories,
): void {
  app.get("/admin/connections", async (request, reply) => {
    const token = readSessionToken(request)
    const principal = await auth.authenticate(token)
    if (!principal) return reply.code(401).send({ error: "unauthenticated" })
    const isAdmin = Object.values(principal.rolesByScope).some((roles) => roles.includes("admin"))
    if (!isAdmin) return reply.code(403).send({ error: "forbidden" })
    const connections = await repositories.wahaConnections.listActive()
    return reply.send({ connections })
  })
}

function readSessionToken(request: FastifyRequest): string | undefined {
  return request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("waha_session="))
    ?.slice("waha_session=".length)
}
