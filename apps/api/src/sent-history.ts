import { createBlindIndex, type createEnvelopeCipher, EnvelopeEncryptionError } from "@waha-command-center/config"
import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import type { AuthService } from "./auth/service"
import type { createRepositories } from "./db/repositories"
import type { PersistenceDatabase } from "./db/client"
import { contacts } from "./db/schema"
import { authenticate, scopeQuerySchema, scopeSchema } from "./waha/session-http-support"

type SentHistoryRepository = ReturnType<typeof createRepositories>["sentHistory"]
type Cipher = ReturnType<typeof createEnvelopeCipher>
type AccountScope = z.infer<typeof scopeSchema>
export type SentHistoryRow = Awaited<ReturnType<SentHistoryRepository["listForUser"]>>["jobs"][number]

const sentHistoryQuerySchema = z.object({
  scope: scopeSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
  q: z.string().max(200).optional(),
  state: z
    .enum(["scheduled", "queued", "attempting", "submitted", "acknowledged", "failed", "unknown", "cancelled"])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

const sentHistoryDetailParamsSchema = z.object({ jobId: z.string().uuid() })

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

export function projectSentHistoryRow(row: SentHistoryRow, cipher: Cipher, recipientName?: string | null) {
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
    recipientName: recipientName ?? null,
    snippet80: message?.split("\n", 1)[0]?.trim().slice(0, 80) ?? null,
    scheduledFor: row.job.scheduledFor,
    timezone: row.job.timezone,
    createdAt: row.job.createdAt,
    updatedAt: row.job.updatedAt,
    state: row.job.state,
    attempts: row.job.attempts,
    nextAttemptAt: row.job.nextAttemptAt,
    failureCode: row.job.failureCode,
    recoveryCode: row.job.recoveryCode,
    providerMessageId: row.job.providerMessageId ?? row.attempt?.providerMessageId ?? null,
  }
}

export function projectSentHistoryDetail(row: SentHistoryRow, cipher: Cipher, recipientName?: string | null) {
  const message = decrypt(
    cipher,
    row.job.messageCiphertext,
    row.job.messageNonce,
    row.job.messageAuthTag,
    row.job.accountScope,
  )
  return {
    ...projectSentHistoryRow(row, cipher, recipientName),
    message,
  }
}

async function resolveRecipientNames(
  db: PersistenceDatabase,
  masterKey: Buffer | undefined,
  cipher: Cipher,
  rows: readonly SentHistoryRow[],
): Promise<Map<string, string | null>> {
  if (!masterKey || rows.length === 0) return new Map()
  const phoneEntries = rows
    .map((row) => {
      const phone = decrypt(
        cipher,
        row.job.recipientPhoneCiphertext,
        row.job.recipientPhoneNonce,
        row.job.recipientPhoneAuthTag,
        row.job.accountScope,
      )
      return phone ? { jobId: row.job.id, phone, sessionId: row.job.sessionId, scope: row.job.accountScope } : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (phoneEntries.length === 0) return new Map()
  const firstScope = phoneEntries[0]?.scope
  if (!firstScope) return new Map()
  const blindIndexes = phoneEntries.map((entry) => createBlindIndex(masterKey, entry.phone))
  const contactRows = await db
    .select({
      phoneBlindIndex: contacts.phoneBlindIndex,
      sessionId: contacts.sessionId,
      accountScope: contacts.accountScope,
      displayNameCiphertext: contacts.displayNameCiphertext,
      displayNameNonce: contacts.displayNameNonce,
      displayNameAuthTag: contacts.displayNameAuthTag,
    })
    .from(contacts)
    .where(eq(contacts.accountScope, firstScope))
  const contactMap = new Map<string, string | null>()
  for (const entry of phoneEntries) {
    const blindIndex = createBlindIndex(masterKey, entry.phone)
    const contact = contactRows.find(
      (row) => row.phoneBlindIndex === blindIndex && row.sessionId === entry.sessionId,
    )
    if (contact?.displayNameCiphertext && contact.displayNameNonce && contact.displayNameAuthTag) {
      try {
        const name = cipher.decrypt(
          {
            version: 1,
            algorithm: "aes-256-gcm",
            ciphertext: contact.displayNameCiphertext,
            nonce: contact.displayNameNonce,
            authTag: contact.displayNameAuthTag,
          },
          { accountScope: entry.scope },
        )
        contactMap.set(entry.jobId, name)
      } catch {
        contactMap.set(entry.jobId, null)
      }
    } else {
      contactMap.set(entry.jobId, null)
    }
  }
  void blindIndexes
  return contactMap
}

export function registerSentHistoryRoutes(
  app: FastifyInstance,
  auth: SentHistoryAuth,
  repository: SentHistoryRepository,
  cipher: Cipher | undefined,
  db?: PersistenceDatabase,
  masterKey?: Buffer | undefined,
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

    const filters: { state?: string; from?: Date; to?: Date } = {}
    if (query.state) filters.state = query.state
    if (query.from) filters.from = query.from
    if (query.to) filters.to = query.to

    const fetchLimit = query.q ? 200 : pageSize
    const fetchOffset = query.q ? 0 : (query.page - 1) * pageSize

    const result = await repository.listForUser(principal.userId, query.scope, fetchLimit, fetchOffset, filters)
    let items = result.jobs.filter((row) => row.job.accountScope === query.scope)

    if (query.q) {
      const qLower = query.q.toLowerCase()
      const decryptedForSearch = items.map((row) => {
        const phone = decrypt(
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
        return { row, phone: phone?.toLowerCase() ?? "", message: message?.toLowerCase() ?? "" }
      })
      const contactMap = db && masterKey ? await resolveRecipientNames(db, masterKey, cipher, items) : new Map()
      const filtered = decryptedForSearch.filter(({ row, phone, message }) => {
        const name = contactMap.get(row.job.id)?.toLowerCase() ?? ""
        return phone.includes(qLower) || message.includes(qLower) || name.includes(qLower)
      })
      const start = (query.page - 1) * pageSize
      const paged = filtered.slice(start, start + pageSize)
      const hasMore = filtered.length > start + pageSize
      const contactMapForPaged = contactMap
      return reply.send({
        items: paged.map(({ row }) =>
          projectSentHistoryRow(row, cipher, contactMapForPaged.get(row.job.id) ?? null),
        ),
        page: query.page,
        pageSize,
        hasMore,
        total: filtered.length,
      })
    }

    const contactMap = db && masterKey ? await resolveRecipientNames(db, masterKey, cipher, items) : new Map()
    const pagedItems = query.q ? items : items.slice(0, pageSize)
    const hasMore = query.q ? result.hasMore : items.length > pageSize || result.hasMore
    return reply.send({
      items: pagedItems.slice(0, pageSize).map((row) => projectSentHistoryRow(row, cipher, contactMap.get(row.job.id) ?? null)),
      page: query.page,
      pageSize,
      hasMore: query.q ? hasMore : result.hasMore,
      total: (result as { total?: number }).total ?? 0,
    })
  })

  app.get("/scoped/sent-history/:jobId", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const parsedParams = sentHistoryDetailParamsSchema.safeParse(request.params)
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid request" })
    const parsedQuery = scopeQuerySchema.safeParse(request.query)
    if (!parsedQuery.success) return reply.code(400).send({ error: "invalid request" })
    const scope = parsedQuery.data.scope
    const scopeRoles = principal.rolesByScope[scope]
    if (!scopeRoles || scopeRoles.length === 0) {
      return reply.code(403).send({ error: "forbidden" })
    }
    if (!cipher) return reply.code(503).send({ error: "encryption unavailable" })
    const { jobId } = parsedParams.data
    const row = await repository.findForUser(jobId, principal.userId, scope)
    if (!row || row.job.accountScope !== scope) return reply.code(404).send({ error: "not found" })
    let recipientName: string | null = null
    if (db && masterKey) {
      const map = await resolveRecipientNames(db, masterKey, cipher, [row])
      recipientName = map.get(row.job.id) ?? null
    }
    return reply.send(projectSentHistoryDetail(row, cipher, recipientName))
  })
}
