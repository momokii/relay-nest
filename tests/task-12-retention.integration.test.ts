import { afterAll, describe, expect, it } from "vitest"

import { createEncryptedBackup, parseEncryptedBackup } from "../apps/api/src/backup/format"
import { createBackupRepository } from "../apps/api/src/backup/repository"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"
import { createRetentionService } from "../apps/api/src/retention/service"

const databaseUrl = process.env.DATABASE_URL
const database =
  process.env.RUN_POSTGRES_TESTS === "1" && databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined
const key = Buffer.alloc(32, 21)

describe.skipIf(!repositories)("Todo 12 PostgreSQL retention and backup", () => {
  it("keeps policy edits non-destructive and purges one scoped category only after confirmation", async () => {
    // Given old Personal and Business schedules and an immutable audit row
    const actor = await repositories.users.create({
      email: `todo12-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "opaque-password-hash",
      displayName: "todo12-admin",
    })
    const personalSession = await createSession("personal")
    const businessSession = await createSession("business")
    const old = new Date("2019-01-01T00:00:00.000Z")
    const personalJob = await createJob(personalSession.id, "personal", old)
    const businessJob = await createJob(businessSession.id, "business", old)
    const audit = await repositories.auditEntries.append({
      accountScope: "personal",
      action: "todo12.fixture",
      subjectType: "fixture",
      subjectId: crypto.randomUUID(),
    })
    await repositories.retentionPolicies.upsert({
      accountScope: "personal",
      category: "messages",
      retentionDays: 30,
    })
    await repositories.retentionPolicies.upsert({
      accountScope: "business",
      category: "messages",
      retentionDays: 30,
    })
    const service = createRetentionService({
      repository: repositories.retentionPolicies,
      now: () => new Date("2020-02-01T00:00:00.000Z"),
      audit: (input) => repositories.auditEntries.append(input).then(() => undefined),
    })

    // When the policy changes and a purge is previewed then cancelled
    await service.updatePolicy(actor.id, "personal", { category: "messages", retentionDays: 60 })
    const preview = await service.preview("personal", "messages")
    await expect(
      service.purge({
        actorUserId: actor.id,
        accountScope: "personal",
        category: "messages",
        cutoff: preview.cutoff,
        previewCount: preview.count,
        previewToken: preview.previewToken,
        confirmed: false,
      }),
    ).rejects.toThrow("confirmation")

    // Then cancellation leaves both schedules, and confirmation deletes exactly the preview batch
    await expect(
      repositories.scheduledJobs.find(personalJob.id, "personal"),
    ).resolves.toMatchObject({
      id: personalJob.id,
    })
    const result = await service.purge({
      actorUserId: actor.id,
      accountScope: "personal",
      category: "messages",
      cutoff: preview.cutoff,
      previewCount: preview.count,
      previewToken: preview.previewToken,
      confirmed: true,
    })
    expect(result.deletedCount).toBe(preview.count)
    await expect(repositories.scheduledJobs.find(personalJob.id, "personal")).resolves.toBeNull()
    await expect(
      repositories.scheduledJobs.find(businessJob.id, "business"),
    ).resolves.toMatchObject({
      id: businessJob.id,
    })
    await repositories.scheduledJobs.cancel(businessJob.id, "business")
    const retained = await database.sql<{ action: string }[]>`
      SELECT action FROM audit_entries WHERE id = ${audit.id}
    `
    expect(retained).toEqual([{ action: "todo12.fixture" }])

    // When the same bounded purge is repeated
    const repeated = await service.preview("personal", "messages")
    expect(repeated.count).toBe(0)
  })

  it("treats audit retention as non-destructive accountability", async () => {
    // Given an existing immutable audit row and an audit retention policy
    const actor = await repositories.users.create({
      email: `todo12-audit-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "opaque-password-hash",
      displayName: "todo12-audit-admin",
    })
    const audit = await repositories.auditEntries.append({
      accountScope: "business",
      action: "todo12.audit.fixture",
      subjectType: "fixture",
      subjectId: crypto.randomUUID(),
    })
    await repositories.retentionPolicies.upsert({
      accountScope: "business",
      category: "audit",
      retentionDays: 1,
    })
    const preview = await repositories.retentionPolicies.preview({
      accountScope: "business",
      category: "audit",
      cutoff: new Date("2030-01-01T00:00:00.000Z"),
    })

    // When the audit purge is confirmed
    await repositories.retentionPolicies.purge({
      accountScope: "business",
      category: "audit",
      cutoff: preview.cutoff,
      previewCount: preview.count,
      actorUserId: actor.id,
    })

    // Then the original accountability row remains immutable and content-free
    const retained = await database.sql<{ action: string; details_ciphertext: string | null }[]>`
      SELECT action, details_ciphertext FROM audit_entries WHERE id = ${audit.id}
    `
    expect(retained).toEqual([{ action: "todo12.audit.fixture", details_ciphertext: null }])
  })

  it("round-trips scoped encrypted rows and rejects a wrong backup key", async () => {
    // Given a Personal schedule containing only opaque encrypted fields
    const session = await createSession("personal")
    const job = await createJob(session.id, "personal", new Date("2030-01-01T00:00:00.000Z"))
    const backupRepository = createBackupRepository(database.sql)
    const payload = await backupRepository.exportScope("personal")
    const backup = createEncryptedBackup(payload, key)

    // When the row is removed and the authenticated backup is restored
    await database.sql`DELETE FROM scheduled_jobs WHERE id = ${job.id}`
    await backupRepository.restoreScope(parseEncryptedBackup(backup, key, "personal"))

    // Then the scoped job returns and wrong-key restore fails closed
    await expect(repositories.scheduledJobs.find(job.id, "personal")).resolves.toMatchObject({
      id: job.id,
      accountScope: "personal",
    })
    await repositories.scheduledJobs.cancel(job.id, "personal")
    expect(() => parseEncryptedBackup(backup, Buffer.alloc(32, 22), "personal")).toThrow()
  })

  async function createSession(accountScope: "personal" | "business") {
    const connection = await repositories.wahaConnections.create({
      name: `todo12-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    return repositories.sessions.create({
      connectionId: connection.id,
      accountScope,
      name: `todo12-session-${crypto.randomUUID()}`,
      wahaSessionName: `todo12-waha-${crypto.randomUUID()}`,
      status: "linked",
    })
  }

  async function createJob(
    sessionId: string,
    accountScope: "personal" | "business",
    createdAt: Date,
  ) {
    return repositories.scheduledJobs.create({
      sessionId,
      accountScope,
      recipientPhoneCiphertext: "opaque-recipient",
      recipientPhoneNonce: "opaque-nonce",
      recipientPhoneAuthTag: "opaque-tag",
      messageCiphertext: "opaque-message",
      messageNonce: "opaque-nonce",
      messageAuthTag: "opaque-tag",
      scheduledFor: createdAt,
      timezone: "UTC",
      idempotencyKey: `todo12-job-${crypto.randomUUID()}`,
      createdAt,
      updatedAt: createdAt,
    })
  }
})

afterAll(async () => {
  await database?.close()
})
