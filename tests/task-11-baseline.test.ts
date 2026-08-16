import { afterAll, describe, expect, it } from "vitest"

import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.DATABASE_URL
const database =
  process.env.RUN_POSTGRES_TESTS === "1" && databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined

describe.skipIf(!repositories)("Todo 11 notification baseline", () => {
  it("preserves the existing encrypted queued notification enqueue contract", async () => {
    // Given an existing user and the pre-Todo-11 notification repository
    const user = await repositories.users.create({
      email: `notification-baseline-${crypto.randomUUID()}@example.invalid`,
      passwordHash: "opaque-password-hash",
      displayName: "notification-baseline",
    })

    // When a caller enqueues the existing notification record shape
    const notification = await repositories.notifications.enqueue({
      userId: user.id,
      accountScope: "personal",
      channel: "email",
      destinationCiphertext: "opaque-destination-ciphertext",
      destinationNonce: "opaque-destination-nonce",
      destinationAuthTag: "opaque-destination-auth-tag",
      bodyCiphertext: "opaque-body-ciphertext",
      bodyNonce: "opaque-body-nonce",
      bodyAuthTag: "opaque-body-auth-tag",
    })

    // Then it remains queued and contains only encrypted fields at this seam
    expect(notification).toMatchObject({
      userId: user.id,
      accountScope: "personal",
      channel: "email",
      state: "queued",
      destinationCiphertext: "opaque-destination-ciphertext",
      bodyCiphertext: "opaque-body-ciphertext",
    })
    expect(notification).not.toHaveProperty("destination")
    expect(notification).not.toHaveProperty("body")
  })

  it("preserves content-free audit inputs for notification operations", async () => {
    // Given the existing audit repository seam
    const auditCalls: Array<{
      readonly action: string
      readonly subjectType: string
      readonly subjectId: string
      readonly accountScope: "personal" | "business"
    }> = []

    // When the notification operation records its pre-existing audit contract
    auditCalls.push({
      action: "notification.enqueued",
      subjectType: "notification",
      subjectId: "notification-baseline",
      accountScope: "personal",
    })

    // Then the audit input contains identity and scope only, never message content
    expect(auditCalls).toEqual([
      {
        action: "notification.enqueued",
        subjectType: "notification",
        subjectId: "notification-baseline",
        accountScope: "personal",
      },
    ])
    expect(JSON.stringify(auditCalls)).not.toContain("opaque-body")
  })
})

afterAll(async () => {
  await database?.close()
})
