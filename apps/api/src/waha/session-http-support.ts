import type { FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"

import type { AuthPrincipal } from "../auth/service"
import { WahaCapabilityError } from "./errors"
import { type createScopedSessionService, ScopedSessionError } from "./sessions"

export const scopeSchema = z.enum(["personal", "business"])
export const sessionParamsSchema = z.object({ sessionId: z.string().uuid() })
export const scopeQuerySchema = z.object({ scope: scopeSchema })
export const lifecycleSchema = z.object({
  action: z.enum(["start", "stop", "restart", "logout", "delete"]),
  confirmed: z.boolean().default(false),
})
export const pairingSchema = z.object({ phoneNumber: z.string().min(8).max(32) })
export const sessionBodySchema = z.record(z.unknown())

export type SessionService = ReturnType<typeof createScopedSessionService>

export type SessionRouteAuth = {
  readonly authenticate: (token: string | undefined) => Promise<AuthPrincipal | null>
  readonly verifyCsrf: (
    token: string | undefined,
    csrfToken: string | undefined,
  ) => Promise<boolean>
}

export async function readSurface(
  auth: SessionRouteAuth,
  request: FastifyRequest,
  reply: FastifyReply,
  operation: (
    principal: AuthPrincipal,
    sessionId: string,
    scope: "personal" | "business",
  ) => Promise<unknown>,
): Promise<unknown> {
  const principal = await authenticate(auth, request, reply)
  if (!principal) return undefined
  const { sessionId } = sessionParamsSchema.parse(request.params)
  const { scope } = scopeQuerySchema.parse(request.query)
  return sendService(reply, () => operation(principal, sessionId, scope))
}

export async function sendService(
  reply: FastifyReply,
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return reply.send(await operation())
  } catch (error) {
    if (error instanceof ScopedSessionError) {
      const status = error.code === "forbidden" || error.code === "role_denied" ? 403 : 409
      return reply.code(status).send({ error: error.code })
    }
    if (error instanceof WahaCapabilityError)
      return reply.code(501).send({ error: "unsupported_capability" })
    return reply.code(502).send({ error: "WAHA unavailable" })
  }
}

export async function authenticate(
  auth: SessionRouteAuth,
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

export async function submitPasskey(
  auth: SessionRouteAuth,
  service: SessionService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<unknown> {
  const principal = await authenticate(auth, request, reply)
  if (!principal) return undefined
  if (!sameOrigin(request) || !(await csrfValid(auth, principal, request)))
    return reply.code(403).send({ error: "forbidden" })
  const { sessionId } = sessionParamsSchema.parse(request.params)
  const { scope } = scopeQuerySchema.parse(request.query)
  const body = sessionBodySchema.parse(request.body)
  return sendService(reply, async () => {
    await service.passkeyAssertion(principal, sessionId, scope, JSON.stringify(body))
    return { accepted: true }
  })
}

export async function confirmPasskey(
  auth: SessionRouteAuth,
  service: SessionService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<unknown> {
  const principal = await authenticate(auth, request, reply)
  if (!principal) return undefined
  if (!sameOrigin(request) || !(await csrfValid(auth, principal, request)))
    return reply.code(403).send({ error: "forbidden" })
  const { sessionId } = sessionParamsSchema.parse(request.params)
  const { scope } = scopeQuerySchema.parse(request.query)
  return sendService(reply, async () => {
    await service.confirmPasskey(principal, sessionId, scope)
    return { accepted: true }
  })
}

export function csrfValid(
  auth: SessionRouteAuth,
  principal: AuthPrincipal,
  request: FastifyRequest,
): Promise<boolean> {
  return auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString())
}

export function sameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin
  return (
    !origin ||
    origin === `http://${request.headers.host}` ||
    origin === `https://${request.headers.host}`
  )
}
