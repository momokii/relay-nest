import { afterAll, describe, expect, it } from "vitest"

import { createBackupRepository } from "../apps/api/src/backup/repository"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.DATABASE_URL
const database =
  process.env.RUN_POSTGRES_TESTS === "1" && databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined

describe.skipIf(!repositories)("Todo 12 backup export bounds", () => {
  it("does not silently omit rows after a byte-budget-shortened page", async () => {
    // Given two ordered Personal jobs whose combined JSON exceeds one transfer page
    const session = await createSession("personal")
    const firstJobId = "00000000-0000-0000-0000-000000000002"
    const secondJobId = "00000000-0000-0000-0000-000000000003"
    await database.sql`
      INSERT INTO scheduled_jobs
        (id, session_id, account_scope, recipient_phone_ciphertext, recipient_phone_nonce,
         recipient_phone_auth_tag, message_ciphertext, message_nonce, message_auth_tag,
         scheduled_for, timezone, idempotency_key)
      VALUES
        (${firstJobId}, ${session.id}, 'personal', 'opaque-phone', 'opaque-nonce',
         'opaque-tag', ${"x".repeat(7 * 1024 * 1024)}, 'opaque-nonce', 'opaque-tag',
         '2030-01-01T00:00:00Z', 'UTC', ${`page-bound-${firstJobId}`}),
        (${secondJobId}, ${session.id}, 'personal', 'opaque-phone', 'opaque-nonce',
         'opaque-tag', ${"y".repeat(2 * 1024 * 1024)}, 'opaque-nonce', 'opaque-tag',
         '2030-01-01T00:00:00Z', 'UTC', ${`page-bound-${secondJobId}`})
    `

    // When the scope is exported
    const exportRepository = createBackupRepository(database.sql)

    try {
      // Then the remaining row is not silently dropped after the first prefix fits
      await expect(exportRepository.exportScope("personal")).rejects.toThrow(
        "backup transfer exceeds its fixed limit",
      )
    } finally {
      await database.sql`DELETE FROM scheduled_jobs WHERE id IN (${firstJobId}, ${secondJobId})`
    }
  })

  it("exports and restores users referenced only by session grants", async () => {
    // Given a Personal user with no role, audit, or notification row
    const session = await createSession("personal")
    const userId = crypto.randomUUID()
    const grantId = crypto.randomUUID()
    await database.sql`
      INSERT INTO users (id, email, password_hash, display_name, active)
      VALUES (${userId}, ${`grant-only-${userId}@example.invalid`}, 'opaque-password-hash',
        'grant-only-user', true)
    `
    await database.sql`
      INSERT INTO session_grants (id, user_id, session_id, account_scope)
      VALUES (${grantId}, ${userId}, ${session.id}, 'personal')
    `
    const repository = createBackupRepository(database.sql)

    try {
      // When the scope is exported, removed, and restored
      const payload = await repository.exportScope("personal")
      expect(payload.tables.users.some((row) => row.id === userId)).toBe(true)
      await database.sql`DELETE FROM session_grants WHERE id = ${grantId}`
      await database.sql`DELETE FROM users WHERE id = ${userId}`
      await repository.restoreScope(payload)

      // Then the grant's user is restored before the grant itself
      await expect(
        database.sql<{ id: string }[]>`SELECT id FROM users WHERE id = ${userId}`,
      ).resolves.toEqual([{ id: userId }])
      await expect(
        database.sql<{ id: string }[]>`SELECT id FROM session_grants WHERE id = ${grantId}`,
      ).resolves.toEqual([{ id: grantId }])
    } finally {
      await database.sql`DELETE FROM session_grants WHERE id = ${grantId}`
      await database.sql`DELETE FROM users WHERE id = ${userId}`
    }
  })

  async function createSession(accountScope: "personal" | "business") {
    const connection = await repositories.wahaConnections.create({
      name: `todo12-export-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    return repositories.sessions.create({
      connectionId: connection.id,
      accountScope,
      name: `todo12-export-session-${crypto.randomUUID()}`,
      wahaSessionName: `todo12-export-waha-${crypto.randomUUID()}`,
      status: "linked",
    })
  }
})

afterAll(async () => {
  await database?.close()
})
