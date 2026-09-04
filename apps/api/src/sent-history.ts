import { type createEnvelopeCipher, EnvelopeEncryptionError } from "@waha-command-center/config"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import type { AuthService } from "./auth/service"
import type { createRepositories } from "./db/repositories"
import { authenticate, scopeSchema } from "./waha/session-http-support"

type SentHistoryRepository = ReturnType<typeof createRepositories>["sentHistory"]
type Cipher = ReturnType<typeof createEnvelopeCipher>
type AccountScope = z.infer<typeof scopeSchema>
export type SentHistoryRow = Awaited<
  ReturnType<SentHistoryRepository["listForUser"]>
>["jobs"][number]

const sentHistoryQuerySchema = z.object({
  scope: scopeSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
})

const SENT_HISTORY_PAGE_SIZE_CAP = 50

type SentHistoryAuth = Pick<AuthService, "authenticate" | "verifyCsrf">

function decrypt(
  cipher: Cipher,
  ciphertext: string,
  nonce: string,
  authTag: string,
  scope: AccountScope,
): string | null {
  try {
    return cipher.decrypt(
      { version: 1, algorithm: "aes-256-gcm", ciphertext, nonce, authTag },
      { accountScope: scope },
    )
  } catch (error) {
    if (error instanceof EnvelopeEncryptionError) return null
    throw error
  }
}

export function projectSentHistoryRow(row: SentHistoryRow, cipher: Cipher) {
  const recipientPhone = decrypt(
    cipher,
    row.job.recipientPhoneCiphertext,
    row.job.recipientPhoneNonce,
    row.job.recipientPhoneAuthTag,
    row.job.accountScope,
  )
  const message = decrypt(
    cipher,
    row.job.messageCiphertext,
    row.job.messageNonce,
    row.job.messageAuthTag,
    row.job.accountScope,
  )
  return {
    id: row.job.id,
    sessionId: row.job.sessionId,
    scope: row.job.accountScope,
    recipientPhone,
    snippet80: message?.split("\n", 1)[0]?.trim().slice(0, 80) ?? null,
    scheduledFor: row.job.scheduledFor,
    createdAt: row.job.createdAt,
    state: row.job.state,
    attempts: row.job.attempts,
    providerMessageId: row.job.providerMessageId ?? row.attempt?.providerMessageId ?? null,
  }
}

export function registerSentHistoryRoutes(
  app: FastifyInstance,
  auth: SentHistoryAuth,
  repository: SentHistoryRepository,
  cipher: Cipher | undefined,
): void {
  app.get("/scoped/sent-history", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const parsedQuery = sentHistoryQuerySchema.safeParse(request.query)
    if (!parsedQuery.success) return reply.code(400).send({ error: "invalid request" })
    const query = parsedQuery.data
    const scopeRoles = principal.rolesByScope[query.scope]
    if (!scopeRoles || scopeRoles.length === 0) {
      return reply.code(403).send({ error: "forbidden" })
    }
    if (!cipher) return reply.code(503).send({ error: "encryption unavailable" })
    const pageSize = Math.min(query.pageSize, SENT_HISTORY_PAGE_SIZE_CAP)

    const result = await repository.listForUser(
      principal.userId,
      query.scope,
      pageSize,
      (query.page - 1) * pageSize,
    )
    return reply.send({
      items: result.jobs
        .filter((row) => row.job.accountScope === query.scope)
        .map((row) => projectSentHistoryRow(row, cipher)),
      page: query.page,
      pageSize,
      hasMore: result.hasMore,
    })
  })
}
