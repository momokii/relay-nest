import { afterAll, describe, expect, it } from "vitest"

import { createDatabase } from "../apps/api/src/db/client"
import {
  createRepositories,
  DuplicateRecordError,
  RepositoryScopeError,
} from "../apps/api/src/db/repositories"

const databaseUrl = process.env.DATABASE_URL
const testDatabase = databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = testDatabase ? createRepositories(testDatabase.db) : undefined
const personal = "personal" as const

describe.skipIf(!repositories)("PostgreSQL repositories", () => {
  it("persists retention metadata in its account scope", async () => {
    // Given a real PostgreSQL repository boundary
    const category = `retention-${crypto.randomUUID()}`

    // When a Personal retention policy is upserted
    await repositories.retentionPolicies.upsert({
      accountScope: personal,
      category,
      retentionDays: 30,
    })

    // Then only the matching scoped policy is returned
    await expect(
      repositories.retentionPolicies.find({ accountScope: personal, category }),
    ).resolves.toMatchObject({ accountScope: personal, category, retentionDays: 30 })
    await expect(
      repositories.retentionPolicies.find({ accountScope: "business", category }),
    ).resolves.toBeNull()
  })

  it("rejects duplicate retention categories inside one scope", async () => {
    // Given a persisted Personal retention policy
    const category = `duplicate-${crypto.randomUUID()}`
    await repositories.retentionPolicies.upsert({
      accountScope: personal,
      category,
      retentionDays: 7,
    })

    // When the same scoped category is inserted again
    const duplicate = repositories.retentionPolicies.insert({
      accountScope: personal,
      category,
      retentionDays: 14,
    })

    // Then the database uniqueness failure is typed
    await expect(duplicate).rejects.toBeInstanceOf(DuplicateRecordError)
  })

  it("keeps audit entries append-only and scope-bound", async () => {
    // Given an audit entry appended through the repository seam
    const entry = await repositories.auditEntries.append({
      accountScope: personal,
      action: "repository-test",
      subjectType: "test",
      subjectId: crypto.randomUUID(),
    })

    // When a caller attempts a cross-scope append or database mutation
    await expect(
      repositories.auditEntries.append({
        accountScope: personal,
        sessionId: crypto.randomUUID(),
        action: "repository-test",
        subjectType: "test",
        subjectId: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(RepositoryScopeError)
    await expect(repositories.auditEntries.update(entry.id, { action: "tamper" })).rejects.toThrow(
      "immutable",
    )
    await expect(repositories.auditEntries.remove(entry.id)).rejects.toThrow("immutable")
  })

  it("persists user roles with account-scope reads and uniqueness", async () => {
    // Given a user and two account scopes
    const user = await repositories.users.create({
      email: `role-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "opaque-password-hash",
      displayName: "opaque-role-user",
    })

    // When the same role is assigned in Personal and Business
    await repositories.userRoles.create({
      userId: user.id,
      accountScope: personal,
      role: "operator",
    })
    await repositories.userRoles.create({
      userId: user.id,
      accountScope: "business",
      role: "operator",
    })

    // Then each scope reads only its own assignment and duplicates fail
    await expect(repositories.userRoles.listForUser(user.id, personal)).resolves.toEqual([
      expect.objectContaining({ accountScope: personal }),
    ])
    await expect(repositories.userRoles.listForUser(user.id, "business")).resolves.toEqual([
      expect.objectContaining({ accountScope: "business" }),
    ])
    await expect(
      repositories.userRoles.create({ userId: user.id, accountScope: personal, role: "operator" }),
    ).rejects.toBeInstanceOf(DuplicateRecordError)
  })

  it("persists grants and exposes connections only through matching sessions", async () => {
    // Given a user, connection, and Personal session
    const user = await repositories.users.create({
      email: `grant-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "opaque-password-hash",
      displayName: "opaque-grant-user",
    })
    const connection = await repositories.wahaConnections.create({
      name: `connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const session = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: personal,
      name: `session-${crypto.randomUUID()}`,
      wahaSessionName: `waha-${crypto.randomUUID()}`,
      status: "linked",
    })

    // When the user receives a scoped session grant
    const grant = await repositories.sessionGrants.create({
      userId: user.id,
      sessionId: session.id,
      accountScope: personal,
    })

    // Then grant and connection reads reject the wrong account scope
    await expect(
      repositories.sessionGrants.find(user.id, session.id, personal),
    ).resolves.toMatchObject({ id: grant.id, accountScope: personal })
    await expect(
      repositories.sessionGrants.find(user.id, session.id, "business"),
    ).resolves.toBeNull()
    await expect(
      repositories.wahaConnections.findForSession(connection.id, personal),
    ).resolves.toMatchObject({
      id: connection.id,
    })
    await expect(
      repositories.wahaConnections.findForSession(connection.id, "business"),
    ).resolves.toBeNull()
    await expect(
      repositories.wahaConnections.create({
        name: connection.name,
        baseUrl: "http://waha.internal",
        apiKeyCiphertext: "opaque-ciphertext",
        apiKeyNonce: "opaque-nonce",
        apiKeyAuthTag: "opaque-tag",
      }),
    ).rejects.toBeInstanceOf(DuplicateRecordError)
    await expect(
      repositories.sessionGrants.create({
        userId: user.id,
        sessionId: session.id,
        accountScope: personal,
      }),
    ).rejects.toBeInstanceOf(DuplicateRecordError)
  })

  it("deletes a session with grants and normalized events while retaining content-free audit accountability", async () => {
    // Given a session with a grant, a normalized event, and an immutable audit entry
    const user = await repositories.users.create({
      email: `delete-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "opaque-password-hash",
      displayName: "opaque-delete-user",
    })
    const connection = await repositories.wahaConnections.create({
      name: `delete-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const session = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: personal,
      name: `delete-session-${crypto.randomUUID()}`,
      wahaSessionName: `delete-waha-${crypto.randomUUID()}`,
      status: "linked",
    })
    await repositories.sessionGrants.create({
      userId: user.id,
      sessionId: session.id,
      accountScope: personal,
    })
    const providerEventId = `delete-event-${crypto.randomUUID()}`
    await repositories.normalizedEvents.create({
      sessionId: session.id,
      accountScope: personal,
      eventType: "session.status",
      providerEventId,
      requestId: `delete-request-${crypto.randomUUID()}`,
      payloadCiphertext: "opaque-ciphertext",
      payloadNonce: "opaque-nonce",
      payloadAuthTag: "opaque-tag",
      occurredAt: new Date(),
    })
    const audit = await repositories.auditEntries.append({
      accountScope: personal,
      sessionId: session.id,
      action: "session.deleted",
      subjectType: "session",
      subjectId: session.id,
    })

    // When the session repository removes the session
    await repositories.sessions.remove(session.id, personal)

    // Then session-owned rows are gone and the immutable audit row remains content-free
    await expect(repositories.sessions.find(session.id, personal)).resolves.toBeNull()
    await expect(repositories.sessionGrants.find(user.id, session.id, personal)).resolves.toBeNull()
    await expect(
      repositories.normalizedEvents.findByProviderId(providerEventId, personal),
    ).resolves.toBeNull()
    const retainedAudit = await testDatabase.sql<{ session_id: string | null; action: string }[]>`
      SELECT session_id, action FROM audit_entries WHERE id = ${audit.id}
    `
    expect(retainedAudit).toEqual([{ session_id: null, action: "session.deleted" }])
  })

  it("rolls back grant deletion when session deletion fails", async () => {
    // Given a session with a grant and a database trigger that rejects its parent deletion
    const user = await repositories.users.create({
      email: `rollback-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "opaque-password-hash",
      displayName: "opaque-rollback-user",
    })
    const connection = await repositories.wahaConnections.create({
      name: `rollback-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const session = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: personal,
      name: `rollback-session-${crypto.randomUUID()}`,
      wahaSessionName: `rollback-waha-${crypto.randomUUID()}`,
      status: "linked",
    })
    await repositories.sessionGrants.create({
      userId: user.id,
      sessionId: session.id,
      accountScope: personal,
    })
    await testDatabase.sql.unsafe(`
      CREATE OR REPLACE FUNCTION reject_test_session_delete() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test session delete failure'; END; $$;
      CREATE TRIGGER reject_test_session_delete
      BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION reject_test_session_delete();
    `)

    // When the parent session deletion fails
    try {
      await expect(repositories.sessions.remove(session.id, personal)).rejects.toThrow()
    } finally {
      await testDatabase.sql.unsafe(`
        DROP TRIGGER IF EXISTS reject_test_session_delete ON sessions;
        DROP FUNCTION IF EXISTS reject_test_session_delete();
      `)
    }

    // Then the transaction preserves both the session and its grant
    await expect(repositories.sessions.find(session.id, personal)).resolves.toMatchObject({
      id: session.id,
    })
    await expect(
      repositories.sessionGrants.find(user.id, session.id, personal),
    ).resolves.toMatchObject({ sessionId: session.id })
  })
})

if (testDatabase) {
  afterAll(async () => testDatabase.close())
}
