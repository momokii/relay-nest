import { afterAll, describe, expect, it } from "vitest"

import { createBackupRepository } from "../apps/api/src/backup/repository"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.DATABASE_URL
const database =
  process.env.RUN_POSTGRES_TESTS === "1" && databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined

describe.skipIf(!repositories)("Todo 12 backup relational transfer", () => {
  it("rejects a Personal payload that references a Business session before writing", async () => {
    // Given a Business session and a Personal scheduled job row pointing at it
    const businessSession = await createSession("business")
    const repository = createBackupRepository(database.sql)

    // When the cross-scope payload is restored
    const restore = repository.restoreScope({
      accountScope: "personal",
      tables: {
        scheduledJobs: [
          {
            id: crypto.randomUUID(),
            session_id: businessSession.id,
            account_scope: "personal",
          },
        ],
      },
    })

    // Then validation fails closed before the database can accept the row
    await expect(restore).rejects.toThrow("backup relational reference is invalid")
    await expect(
      database.sql<
        { count: string }[]
      >`SELECT count(*) FROM scheduled_jobs WHERE session_id = ${businessSession.id}`,
    ).resolves.toEqual([{ count: "0" }])
  })

  it("rejects a missing relational parent before any restore write", async () => {
    // Given a Personal contact whose session parent is absent from the payload and database
    const repository = createBackupRepository(database.sql)
    const missingSessionId = crypto.randomUUID()

    // When the malformed relational payload is restored
    const restore = repository.restoreScope({
      accountScope: "personal",
      tables: {
        contacts: [
          {
            id: crypto.randomUUID(),
            session_id: missingSessionId,
            account_scope: "personal",
          },
        ],
      },
    })

    // Then the missing parent is rejected without a committed child row
    await expect(restore).rejects.toThrow("backup relational reference is invalid")
    await expect(
      database.sql<
        { count: string }[]
      >`SELECT count(*) FROM contacts WHERE session_id = ${missingSessionId}`,
    ).resolves.toEqual([{ count: "0" }])
  })

  it("does not partially restore rows when a later relational reference is invalid", async () => {
    // Given a valid Personal user row and a user role referring to a different missing user
    const repository = createBackupRepository(database.sql)
    const userId = crypto.randomUUID()

    // When both rows are restored in one payload
    const restore = repository.restoreScope({
      accountScope: "personal",
      tables: {
        users: [
          {
            id: userId,
            email: `backup-${crypto.randomUUID()}@example.invalid`,
            password_hash: "opaque-password-hash",
            display_name: "backup-user",
            active: true,
          },
        ],
        userRoles: [
          {
            id: crypto.randomUUID(),
            user_id: crypto.randomUUID(),
            account_scope: "personal",
            role: "viewer",
          },
        ],
      },
    })

    // Then no part of the payload is committed
    await expect(restore).rejects.toThrow("backup relational reference is invalid")
    await expect(
      database.sql<{ count: string }[]>`SELECT count(*) FROM users WHERE id = ${userId}`,
    ).resolves.toEqual([{ count: "0" }])
  })

  it("exports and restores session messaging safety settings", async () => {
    // Given a Personal session with non-default messaging safety settings
    const session = await createSession("personal")
    await database.sql`
      INSERT INTO session_messaging_safety
        (session_id, account_scope, daily_budget, pacing_seconds, burst_limit,
         burst_window_seconds, duplicate_window_seconds, quiet_hours_start, quiet_hours_end)
      VALUES
        (${session.id}, 'personal', 7, 11, 2, 120, 900, '22:00', '07:00')
    `
    const repository = createBackupRepository(database.sql)

    // When the scope is exported, deleted, and restored
    const payload = await repository.exportScope("personal")
    await database.sql`DELETE FROM session_messaging_safety WHERE session_id = ${session.id}`
    await repository.restoreScope(payload)

    // Then the complete safety row is present again
    await expect(
      database.sql<
        { daily_budget: number; pacing_seconds: number; quiet_hours_start: string }[]
      >`SELECT daily_budget, pacing_seconds, quiet_hours_start
        FROM session_messaging_safety WHERE session_id = ${session.id}`,
    ).resolves.toEqual([{ daily_budget: 7, pacing_seconds: 11, quiet_hours_start: "22:00" }])
  })

  it("rejects a transfer larger than the fixed row ceiling before opening a transaction", async () => {
    // Given a payload larger than the repository's fixed restore-row budget
    const repository = createBackupRepository(database.sql)
    const rows = Array.from({ length: 10_001 }, (_, index) => ({ id: `row-${index}` }))

    // When the oversized transfer is restored
    const restore = repository.restoreScope({ accountScope: "personal", tables: { users: rows } })

    // Then it fails as a typed bounded-transfer error without writing anything
    await expect(restore).rejects.toThrow("backup transfer exceeds its fixed limit")
  })

  async function createSession(accountScope: "personal" | "business") {
    const connection = await repositories.wahaConnections.create({
      name: `todo12-backup-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    return repositories.sessions.create({
      connectionId: connection.id,
      accountScope,
      name: `todo12-backup-session-${crypto.randomUUID()}`,
      wahaSessionName: `todo12-backup-waha-${crypto.randomUUID()}`,
      status: "linked",
    })
  }
})

afterAll(async () => {
  await database?.close()
})
