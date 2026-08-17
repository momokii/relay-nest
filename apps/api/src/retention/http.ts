import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"

import type { AdminService } from "../auth/admin"
import type { AuthPrincipal, AuthService } from "../auth/service"
import { BackupFormatError, createEncryptedBackup, parseEncryptedBackup } from "../backup/format"
import type { createBackupRepository } from "../backup/repository"

import { sameOrigin } from "../waha/session-http-support"
import { RETENTION_CATEGORIES, type RetentionCategory } from "./contracts"
import {
  type createRetentionService,
  PurgeConfirmationRequiredError,
  RetentionPolicyMissingError,
} from "./service"

const scopeSchema = z.enum(["personal", "business"])
const paramsSchema = z.object({ accountScope: scopeSchema })
const categorySchema = z.enum(RETENTION_CATEGORIES)
const policySchema = z.object({
  category: categorySchema,
  retentionDays: z.number().int().min(1).max(3650),
})
const previewSchema = z.object({ category: categorySchema })
const purgeSchema = z.object({
  category: categorySchema,
  cutoff: z.string().datetime({ offset: true }),
  previewCount: z.number().int().min(0).max(10_000),
  previewToken: z.string().uuid(),
  confirmed: z.boolean(),
})
const restoreSchema = z.object({ backup: z.unknown() })

type RetentionService = ReturnType<typeof createRetentionService>
type BackupRepository = ReturnType<typeof createBackupRepository>

export function registerRetentionRoutes(
  app: FastifyInstance,
  auth: AuthService,
  admin: AdminService,
  retention: RetentionService,
  backups: BackupRepository,
  masterKey: Buffer | undefined,
  audit: (input: {
    readonly actorUserId: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: "personal" | "business"
  }) => Promise<void>,
): void {
  app.get("/admin/retention/:accountScope", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    if (!(await admin.canManage(principal.userId, accountScope))) return forbidden(reply)
    return reply.send(await retention.list(accountScope))
  })

  app.put("/admin/retention/:accountScope", async (request, reply) => {
    const principal = await requireMutationPrincipal(auth, admin, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    const body = policySchema.parse(request.body)
    return reply.send(await retention.updatePolicy(principal.userId, accountScope, body))
  })

  app.post("/admin/retention/:accountScope/preview", async (request, reply) => {
    const principal = await requireMutationPrincipal(auth, admin, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    const { category } = previewSchema.parse(request.body)
    return reply.send(await retention.preview(accountScope, category))
  })

  app.post("/admin/retention/:accountScope/purge", async (request, reply) => {
    const principal = await requireMutationPrincipal(auth, admin, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    const body = purgeSchema.parse(request.body)
    const result = await retention.purge({
      actorUserId: principal.userId,
      accountScope,
      category: body.category,
      cutoff: new Date(body.cutoff),
      previewCount: body.previewCount,
      previewToken: body.previewToken,
      confirmed: body.confirmed,
    })
    return reply.send(result)
  })

  app.post("/admin/backups/:accountScope", async (request, reply) => {
    const principal = await requireMutationPrincipal(auth, admin, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    const backup = createEncryptedBackup(await backups.exportScope(accountScope), masterKey)
    await audit({
      actorUserId: principal.userId,
      action: "backup.created",
      subjectType: "backup",
      subjectId: crypto.randomUUID(),
      accountScope,
    })
    return reply.send(backup)
  })

  app.post("/admin/backups/:accountScope/restore", async (request, reply) => {
    const principal = await requireMutationPrincipal(auth, admin, request, reply)
    if (!principal) return
    const { accountScope } = paramsSchema.parse(request.params)
    const { backup } = restoreSchema.parse(request.body)
    const payload = parseEncryptedBackup(backup, masterKey, accountScope)
    await backups.restoreScope(payload)
    await audit({
      actorUserId: principal.userId,
      action: "backup.restored",
      subjectType: "backup",
      subjectId: crypto.randomUUID(),
      accountScope,
    })
    return reply.send({ restored: true, accountScope })
  })
}

async function requireMutationPrincipal(
  auth: AuthService,
  admin: AdminService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthPrincipal | null> {
  if (!sameOrigin(request) || !request.headers.origin) {
    await reply.code(403).send({ error: "forbidden" })
    return null
  }
  const principal = await authenticate(auth, request, reply)
  if (!principal) return null
  const { accountScope } = paramsSchema.parse(request.params)
  if (
    !(await admin.canManage(principal.userId, accountScope)) ||
    !(await auth.verifyCsrf(principal.sessionToken, request.headers["x-csrf-token"]?.toString()))
  ) {
    await reply.code(403).send({ error: "forbidden" })
    return null
  }
  return principal
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

function forbidden(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({ error: "forbidden" })
}

export function sendRetentionError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof PurgeConfirmationRequiredError)
    return reply.code(409).send({ error: "confirmation_required" })
  if (error instanceof RetentionPolicyMissingError)
    return reply.code(409).send({ error: "policy_missing" })
  if (error instanceof BackupFormatError) return reply.code(400).send({ error: "invalid_backup" })
  return reply.code(500).send({ error: "internal error" })
}

export type { RetentionCategory }
