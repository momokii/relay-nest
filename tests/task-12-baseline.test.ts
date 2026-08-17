import { afterAll, describe, expect, it } from "vitest"

import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.DATABASE_URL
const database =
  process.env.RUN_POSTGRES_TESTS === "1" && databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined

describe.skipIf(!repositories)("Todo 12 baseline contracts", () => {
  it("keeps retention policy changes as metadata-only updates", async () => {
    // Given an existing scoped retention policy
    const category = `baseline-${crypto.randomUUID()}`
    await repositories.retentionPolicies.upsert({
      accountScope: "personal",
      category,
      retentionDays: 30,
    })

    // When the policy is changed
    const updated = await repositories.retentionPolicies.upsert({
      accountScope: "personal",
      category,
      retentionDays: 7,
    })

    // Then only the policy metadata changes at this repository seam
    expect(updated).toMatchObject({ accountScope: "personal", category, retentionDays: 7 })
  })

  it("keeps existing audit rows append-only and content-free", async () => {
    // Given an audit entry appended through the existing repository seam
    const entry = await repositories.auditEntries.append({
      accountScope: "personal",
      action: "todo12.baseline",
      subjectType: "test",
      subjectId: crypto.randomUUID(),
    })

    // When a caller attempts to mutate or remove the accountability record
    // Then the database rejects both operations and the row remains unchanged
    await expect(
      repositories.auditEntries.update(entry.id, { action: "tampered" }),
    ).rejects.toThrow("immutable")
    await expect(repositories.auditEntries.remove(entry.id)).rejects.toThrow("immutable")
    const retained = await database.sql<{ action: string; details_ciphertext: string | null }[]>`
      SELECT action, details_ciphertext FROM audit_entries WHERE id = ${entry.id}
    `
    expect(retained).toEqual([{ action: "todo12.baseline", details_ciphertext: null }])
  })
})

afterAll(async () => {
  await database?.close()
})
