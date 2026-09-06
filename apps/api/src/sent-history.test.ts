import { createEnvelopeCipher } from "@waha-command-center/config"
import Fastify from "fastify"
import { describe, expect, it } from "vitest"

import type { AuthPrincipal } from "./auth/service"
import type { SentHistoryRow } from "./sent-history"
import {
  projectSentHistoryDetail,
  projectSentHistoryRow,
  registerSentHistoryRoutes,
} from "./sent-history"

const cipher = createEnvelopeCipher(Buffer.alloc(32, 7))
const principal: AuthPrincipal = {
  userId: "44444444-4444-4444-8444-444444444444",
  email: "operator@example.test",
  displayName: "Operator",
  roles: ["operator"] as const,
  rolesByScope: { personal: ["operator"], business: [] },
  sessionId: "55555555-5555-4555-8555-555555555555",
  sessionToken: "session-token",
  csrfToken: "",
}

function row(
  key: Buffer,
  state: SentHistoryRow["job"]["state"],
  options: Readonly<{
    id?: string
    createdAt?: string
    message?: string
    nextAttemptAt?: Date
    failureCode?: string
    recoveryCode?: string
  }> = {},
): SentHistoryRow {
  const rowCipher = createEnvelopeCipher(key)
  const phone = rowCipher.encrypt("628123456789", { accountScope: "personal" })
  const message = rowCipher.encrypt(
    options.message ?? "A message that is safe to show as a short snippet",
    {
      accountScope: "personal",
    },
  )
  return {
    job: {
      id: options.id ?? "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      accountScope: "personal",
      recipientPhoneCiphertext: phone.ciphertext,
      recipientPhoneNonce: phone.nonce,
      recipientPhoneAuthTag: phone.authTag,
      messageCiphertext: message.ciphertext,
      messageNonce: message.nonce,
      messageAuthTag: message.authTag,
      messageBlindIndex: null,
      scheduledFor: new Date("2026-09-01T10:00:00.000Z"),
      timezone: "UTC",
      idempotencyKey: "history-test",
      state,
      attempts: 1,
      nextAttemptAt: options.nextAttemptAt ?? null,
      leaseOwner: null,
      leaseExpiresAt: null,
      providerMessageId: null,
      recoveryCode: options.recoveryCode ?? null,
      failureCode: options.failureCode ?? null,
      editVersion: 0,
      createdAt: new Date(options.createdAt ?? "2026-09-01T09:00:00.000Z"),
      updatedAt: new Date(options.createdAt ?? "2026-09-01T09:00:00.000Z"),
    },
    attempt: {
      id: "33333333-3333-4333-8333-333333333333",
      jobId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      accountScope: "personal",
      attemptNumber: 1,
      state,
      providerMessageId: "provider-1",
      failureCode: null,
      attemptedAt: new Date("2026-09-01T09:01:00.000Z"),
    },
  }
}

describe("sent-history projection", () => {
  it("projects an authorized Personal row without encrypted or full message fields", () => {
    const result = projectSentHistoryRow(
      row(Buffer.alloc(32, 7), "submitted", {
        message: `  first line ${"x".repeat(80)}  \nsecond line must not appear`,
      }),
      cipher,
    )

    expect(result).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      scope: "personal",
      recipientPhone: "628123456789",
      recipientName: null,
      snippet80: `first line ${"x".repeat(80)}`.slice(0, 80),
      attempts: 1,
      scheduledFor: new Date("2026-09-01T10:00:00.000Z"),
      timezone: "UTC",
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
      updatedAt: new Date("2026-09-01T09:00:00.000Z"),
      state: "submitted",
      nextAttemptAt: null,
      failureCode: null,
      recoveryCode: null,
      providerMessageId: "provider-1",
    })
    expect(result).not.toHaveProperty("recipientPhoneCiphertext")
    expect(result).not.toHaveProperty("message")
  })

  it("passes scheduling and failure metadata through the list projection", () => {
    const nextAttemptAt = new Date("2026-09-01T10:05:00.000Z")
    const result = projectSentHistoryRow(
      row(Buffer.alloc(32, 7), "failed", {
        failureCode: "waha_send_failed",
        recoveryCode: "recover-abc",
        nextAttemptAt,
      }),
      cipher,
    )

    expect(result.timezone).toBe("UTC")
    expect(result.nextAttemptAt).toEqual(nextAttemptAt)
    expect(result.failureCode).toBe("waha_send_failed")
    expect(result.recoveryCode).toBe("recover-abc")
    expect(result.updatedAt).toEqual(new Date("2026-09-01T09:00:00.000Z"))
  })

  it("detail projection returns every list field plus the full decrypted message", () => {
    const result = projectSentHistoryDetail(
      row(Buffer.alloc(32, 7), "submitted", {
        message: "first line\nsecond line must appear in full",
      }),
      cipher,
    )

    expect(result.message).toBe("first line\nsecond line must appear in full")
    expect(result.snippet80).toBe("first line")
    expect(result.recipientPhone).toBe("628123456789")
    expect(result.timezone).toBe("UTC")
    expect(result.state).toBe("submitted")
    expect(result).not.toHaveProperty("messageCiphertext")
    expect(result).not.toHaveProperty("messageNonce")
    expect(result).not.toHaveProperty("messageAuthTag")
  })

  it("detail projection redacts message and phone when the encryption key is wrong", () => {
    const result = projectSentHistoryDetail(row(Buffer.alloc(32, 8), "failed"), cipher)

    expect(result.message).toBeNull()
    expect(result.recipientPhone).toBeNull()
  })

  it("preserves submitted as the canonical scheduled-job state", () => {
    const result = projectSentHistoryRow(row(Buffer.alloc(32, 7), "submitted"), cipher)

    expect(result.state).toBe("submitted")
  })

  it("returns redacted plaintext fields when the encryption key is wrong", () => {
    const result = projectSentHistoryRow(row(Buffer.alloc(32, 8), "failed"), cipher)

    expect(result.recipientPhone).toBeNull()
    expect(result.snippet80).toBeNull()
    expect(result.state).toBe("failed")
  })

  it("limits an authorized Personal request to granted rows and caps page size", async () => {
    const app = Fastify()
    let requestedScope: string | undefined
    let requestedLimit: number | undefined
    registerSentHistoryRoutes(
      app,
      {
        authenticate: async () => principal,
        verifyCsrf: async () => true,
      },
      {
        listForUser: async (_userId, scope, limit) => {
          requestedScope = scope
          requestedLimit = limit
          return {
            jobs: scope === "personal" ? [row(Buffer.alloc(32, 7), "submitted")] : [],
            hasMore: false, total: 0,
          }
        },
        findForUser: async () => null,
      },
      cipher,
    )

    const response = await app.inject({ url: "/scoped/sent-history?scope=personal&pageSize=100" })
    const body = response.json<{
      readonly items: readonly ReturnType<typeof projectSentHistoryRow>[]
      readonly pageSize: number
    }>()

    expect(response.statusCode).toBe(200)
    expect(requestedScope).toBe("personal")
    expect(requestedLimit).toBe(50)
    expect(body.items).toHaveLength(1)
    expect(body.pageSize).toBe(50)
    await app.close()
  })

  it("denies a scope before querying or decrypting when the caller has no scoped role", async () => {
    const app = Fastify()
    let queried = false
    registerSentHistoryRoutes(
      app,
      {
        authenticate: async () => principal,
        verifyCsrf: async () => true,
      },
      {
        listForUser: async () => {
          queried = true
          return { jobs: [], hasMore: false, total: 0 }
        },
        findForUser: async () => null,
      },
      cipher,
    )

    const response = await app.inject({ url: "/scoped/sent-history?scope=business" })

    expect(response.statusCode).toBe(403)
    expect(queried).toBe(false)
    await app.close()
  })

  it("returns 403 for a Viewer without a session grant", async () => {
    const app = Fastify()
    const viewerWithoutBusinessGrant: AuthPrincipal = {
      ...principal,
      roles: ["viewer"],
      rolesByScope: { personal: ["viewer"], business: [] },
    }
    let queried = false
    registerSentHistoryRoutes(
      app,
      {
        authenticate: async () => viewerWithoutBusinessGrant,
        verifyCsrf: async () => true,
      },
      {
        listForUser: async () => {
          queried = true
          return { jobs: [], hasMore: false, total: 0 }
        },
        findForUser: async () => null,
      },
      cipher,
    )

    const response = await app.inject({ url: "/scoped/sent-history?scope=business" })

    expect(response.statusCode).toBe(403)
    expect(queried).toBe(false)
    await app.close()
  })

  it("returns an empty result for rows returned from a different account scope", async () => {
    const app = Fastify()
    const businessViewer: AuthPrincipal = {
      ...principal,
      rolesByScope: { personal: [], business: ["viewer"] },
    }
    registerSentHistoryRoutes(
      app,
      {
        authenticate: async () => businessViewer,
        verifyCsrf: async () => true,
      },
      {
        listForUser: async () => ({
          jobs: [row(Buffer.alloc(32, 7), "submitted")],
          hasMore: false, total: 0,
        }),
        findForUser: async () => null,
      },
      cipher,
    )

    const response = await app.inject({ url: "/scoped/sent-history?scope=business" })

    expect(response.statusCode).toBe(200)
    expect(response.json<{ readonly items: readonly unknown[] }>().items).toEqual([])
    await app.close()
  })

  it("pagination returns page two in createdAt descending order with bounded snippets", async () => {
    const app = Fastify()
    const newest = row(Buffer.alloc(32, 7), "submitted", {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createdAt: "2026-09-02T09:00:00.000Z",
      message: "n".repeat(120),
    })
    const second = row(Buffer.alloc(32, 7), "acknowledged", {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdAt: "2026-09-01T09:00:00.000Z",
      message: "s".repeat(120),
    })
    let requestedOffset: number | undefined
    registerSentHistoryRoutes(
      app,
      { authenticate: async () => principal, verifyCsrf: async () => true },
      {
        listForUser: async (_userId, _scope, limit, offset) => {
          requestedOffset = offset
          expect(limit).toBe(1)
          return { jobs: [second], hasMore: false, total: 0 }
        },
        findForUser: async () => null,
      },
      cipher,
    )

    const response = await app.inject({
      url: "/scoped/sent-history?scope=personal&page=2&pageSize=1",
    })
    const body = response.json<{
      readonly items: readonly ReturnType<typeof projectSentHistoryRow>[]
      readonly page: number
      readonly pageSize: number
    }>()

    expect(response.statusCode).toBe(200)
    expect(requestedOffset).toBe(1)
    expect(body.page).toBe(2)
    expect(body.pageSize).toBe(1)
    expect(body.items[0]?.id).toBe(second.job.id)
    expect(body.items[0]?.snippet80).toHaveLength(80)
    expect(body.items[0]).not.toHaveProperty("message")
    expect(newest.job.createdAt.getTime()).toBeGreaterThan(second.job.createdAt.getTime())
    await app.close()
  })

  it("pagination rejects a negative page with HTTP 400", async () => {
    const app = Fastify()
    registerSentHistoryRoutes(
      app,
      { authenticate: async () => principal, verifyCsrf: async () => true },
      { listForUser: async () => ({ jobs: [], hasMore: false, total: 0 }), findForUser: async () => null },
      cipher,
    )

    const response = await app.inject({
      url: "/scoped/sent-history?scope=personal&page=-1&pageSize=1",
    })

    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it("detail route returns the full decrypted message for a granted row", async () => {
    const app = Fastify()
    const detailRow = row(Buffer.alloc(32, 7), "submitted", {
      message: "first line\nsecond line must appear in full",
    })
    let requestedJobId: string | undefined
    let requestedUserId: string | undefined
    let requestedScope: string | undefined
    registerSentHistoryRoutes(
      app,
      { authenticate: async () => principal, verifyCsrf: async () => true },
      {
        listForUser: async () => ({ jobs: [], hasMore: false, total: 0 }),
        findForUser: async (jobId, userId, scope) => {
          requestedJobId = jobId
          requestedUserId = userId
          requestedScope = scope
          return detailRow
        },
      },
      cipher,
    )

    const response = await app.inject({
      url: "/scoped/sent-history/11111111-1111-4111-8111-111111111111?scope=personal",
    })
    const body = response.json<ReturnType<typeof projectSentHistoryDetail>>()

    expect(response.statusCode).toBe(200)
    expect(requestedJobId).toBe("11111111-1111-4111-8111-111111111111")
    expect(requestedUserId).toBe(principal.userId)
    expect(requestedScope).toBe("personal")
    expect(body.message).toBe("first line\nsecond line must appear in full")
    expect(body.recipientPhone).toBe("628123456789")
    expect(body).not.toHaveProperty("messageCiphertext")
    expect(body).not.toHaveProperty("messageNonce")
    await app.close()
  })

  it("detail route returns 401 for an unauthenticated caller", async () => {
    const app = Fastify()
    let queried = false
    registerSentHistoryRoutes(
      app,
      { authenticate: async () => null, verifyCsrf: async () => true },
      {
        listForUser: async () => ({ jobs: [], hasMore: false, total: 0 }),
        findForUser: async () => {
          queried = true
          return null
        },
      },
      cipher,
    )

    const response = await app.inject({
      url: "/scoped/sent-history/11111111-1111-4111-8111-111111111111?scope=personal",
    })

    expect(response.statusCode).toBe(401)
    expect(queried).toBe(false)
    await app.close()
  })

  it("detail route denies a scope before querying when the caller has no scoped role", async () => {
    const app = Fastify()
    let queried = false
    registerSentHistoryRoutes(
      app,
      { authenticate: async () => principal, verifyCsrf: async () => true },
      {
        listForUser: async () => ({ jobs: [], hasMore: false, total: 0 }),
        findForUser: async () => {
          queried = true
          return null
        },
      },
      cipher,
    )

    const response = await app.inject({
      url: "/scoped/sent-history/11111111-1111-4111-8111-111111111111?scope=business",
    })

    expect(response.statusCode).toBe(403)
    expect(queried).toBe(false)
    await app.close()
  })

  it("detail route returns 404 for an unknown id or a job without a caller grant", async () => {
    const app = Fastify()
    registerSentHistoryRoutes(
      app,
      { authenticate: async () => principal, verifyCsrf: async () => true },
      {
        listForUser: async () => ({ jobs: [], hasMore: false, total: 0 }),
        findForUser: async () => null,
      },
      cipher,
    )

    const response = await app.inject({
      url: "/scoped/sent-history/11111111-1111-4111-8111-111111111111?scope=personal",
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it("detail route rejects a non-uuid job id with HTTP 400 before querying", async () => {
    const app = Fastify()
    let queried = false
    registerSentHistoryRoutes(
      app,
      { authenticate: async () => principal, verifyCsrf: async () => true },
      {
        listForUser: async () => ({ jobs: [], hasMore: false, total: 0 }),
        findForUser: async () => {
          queried = true
          return null
        },
      },
      cipher,
    )

    const response = await app.inject({
      url: "/scoped/sent-history/not-a-uuid?scope=personal",
    })

    expect(response.statusCode).toBe(400)
    expect(queried).toBe(false)
    await app.close()
  })
})
