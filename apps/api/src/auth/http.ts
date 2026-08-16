import { workspaceConfig } from "@waha-command-center/config"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"

import type { AdminService } from "./admin"
import { AuthFailure, type AuthPrincipal, type AuthService, RateLimitFailure } from "./service"

const scopeSchema = z.enum(["personal", "business"])
const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(256),
})
const bootstrapSchema = credentialsSchema.extend({ displayName: z.string().trim().min(1).max(120) })
const createUserSchema = bootstrapSchema.extend({
  roles: z
    .array(z.object({ accountScope: scopeSchema, role: z.enum(["admin", "operator", "viewer"]) }))
    .min(1)
    .max(6),
})
const grantSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  accountScope: scopeSchema,
})

const SESSION_COOKIE = "waha_session"
const CSRF_COOKIE = "waha_csrf"

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthService,
  admin: AdminService,
  options: { readonly includeScopedSessionCompatibility?: boolean } = {},
): void {
  app.post("/auth/bootstrap", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    try {
      const principal = await auth.bootstrap(bootstrapSchema.parse(request.body))
      setAuthCookies(reply, principal.sessionToken, principal.csrfToken)
      return reply.code(201).send(publicPrincipal(principal))
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post("/auth/login", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    try {
      const body = credentialsSchema.parse(request.body)
      const principal = await auth.login({
        ...body,
        rateKey: request.ip,
      })
      setAuthCookies(reply, principal.sessionToken, principal.csrfToken)
      return reply.send(publicPrincipal(principal))
    } catch (error) {
      if (error instanceof z.ZodError) {
        try {
          await auth.recordFailedLogin(request.ip)
        } catch (failure) {
          return sendAuthError(reply, failure)
        }
      }
      return sendAuthError(reply, error)
    }
  })

  app.post("/auth/logout", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const token = readCookie(request, SESSION_COOKIE)
    if (!(await requireCsrf(auth, request, token)))
      return reply.code(403).send({ error: "forbidden" })
    await auth.revoke(token)
    clearAuthCookies(reply)
    return reply.code(204).send()
  })

  app.get("/auth/me", async (request, reply) => {
    const principal = await auth.authenticate(readCookie(request, SESSION_COOKIE))
    if (!principal) return reply.code(401).send({ error: "unauthenticated" })
    return reply.send(publicPrincipal(principal))
  })

  app.post("/admin/users", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const body = createUserSchema.parse(request.body)
    const manageableScopes = await Promise.all(
      body.roles.map((role) => admin.canManage(principal.userId, role.accountScope)),
    )
    if (
      manageableScopes.some((manageable) => !manageable) ||
      !(await requireCsrf(auth, request, principal.sessionToken))
    )
      return reply.code(403).send({ error: "forbidden" })
    const user = await admin.createUser({ ...body, actorUserId: principal.userId })
    return reply.code(201).send(user)
  })

  app.post("/admin/users/:userId/disable", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const params = z.object({ userId: z.string().uuid() }).parse(request.params)
    if (
      !(await admin.canDisable(principal.userId, params.userId)) ||
      !(await requireCsrf(auth, request, principal.sessionToken))
    )
      return reply.code(403).send({ error: "forbidden" })
    await auth.disableUser(params.userId, principal.userId)
    return reply.code(204).send()
  })

  app.post("/admin/grants", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const body = grantSchema.parse(request.body)
    if (
      !(await admin.canManage(principal.userId, body.accountScope)) ||
      !(await requireCsrf(auth, request, principal.sessionToken))
    )
      return reply.code(403).send({ error: "forbidden" })
    await admin.createGrant({ ...body, actorUserId: principal.userId })
    return reply.code(204).send()
  })

  if (options.includeScopedSessionCompatibility ?? true) {
    app.get("/scoped/sessions/:sessionId", async (request, reply) => {
      const principal = await authenticate(auth, request, reply)
      if (!principal) return
      const params = z.object({ sessionId: z.string().uuid() }).parse(request.params)
      const scope = z.object({ scope: scopeSchema }).parse(request.query).scope
      const decision = await auth.authorize(principal, params.sessionId, scope, "read")
      if (!decision.allowed)
        return reply
          .code(decision.reason === "unauthenticated" ? 401 : 403)
          .send({ error: "forbidden" })
      return reply.send({ sessionId: params.sessionId, accountScope: scope, authorized: true })
    })
  }

  app.post("/scoped/sessions/:sessionId/commands", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params)
    const scope = z.object({ scope: scopeSchema }).parse(request.query).scope
    if (!(await requireCsrf(auth, request, principal.sessionToken)))
      return reply.code(403).send({ error: "forbidden" })
    const decision = await auth.authorize(principal, params.sessionId, scope, "command")
    if (!decision.allowed) return reply.code(403).send({ error: "forbidden" })
    return reply.send({ sessionId: params.sessionId, accountScope: scope, accepted: true })
  })
}

async function authenticate(auth: AuthService, request: FastifyRequest, reply: FastifyReply) {
  const principal = await auth.authenticate(readCookie(request, SESSION_COOKIE))
  if (!principal) {
    await reply.code(401).send({ error: "unauthenticated" })
    return null
  }
  return principal
}

async function requireCsrf(
  auth: AuthService,
  request: FastifyRequest,
  token: string | undefined,
): Promise<boolean> {
  return auth.verifyCsrf(token, request.headers["x-csrf-token"]?.toString())
}

function publicPrincipal(principal: AuthPrincipal) {
  return {
    user: {
      id: principal.userId,
      email: principal.email,
      displayName: principal.displayName,
      rolesByScope: principal.rolesByScope,
    },
  }
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return value?.slice(name.length + 1)
}

function setAuthCookies(reply: FastifyReply, sessionToken: string, csrfToken: string): void {
  const secure = workspaceConfig.appEnv === "production" ? "; Secure" : ""
  reply.header("set-cookie", [
    `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`,
    `${CSRF_COOKIE}=${csrfToken}; Path=/; SameSite=Strict; Max-Age=28800${secure}`,
  ])
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.header("set-cookie", [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    `${CSRF_COOKIE}=; Path=/; SameSite=Strict; Max-Age=0`,
  ])
}

function sameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin
  return (
    !origin ||
    origin === `http://${request.headers.host}` ||
    origin === `https://${request.headers.host}`
  )
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof RateLimitFailure)
    return reply
      .header("retry-after", error.retryAfterSeconds)
      .code(429)
      .send({ error: "too many login attempts" })
  if (error instanceof AuthFailure)
    return reply.code(409).send({ error: "authentication unavailable" })
  if (error instanceof z.ZodError) return reply.code(400).send({ error: "invalid request" })
  return reply.code(500).send({ error: "internal error" })
}
