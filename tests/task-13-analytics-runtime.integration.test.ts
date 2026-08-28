import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createAnalyticsSource } from "../apps/api/src/analytics/runtime"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"
import { createEnvelopeCipher } from "../packages/config/src/encryption"

const databaseUrl = process.env.TASK13_DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined
const masterKey = Buffer.alloc(32, 7)
const cipher = createEnvelopeCipher(masterKey)
const personalSessionId = crypto.randomUUID()
const businessSessionId = crypto.randomUUID()
let personalConnectionId = ""
let businessConnectionId = ""

describe.skipIf(!database || !repositories)("PostgreSQL analytics source", () => {
  beforeAll(async () => {
    if (!database || !repositories) return
    const personalConnection = await repositories.wahaConnections.create({
      name: `analytics-personal-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const businessConnection = await repositories.wahaConnections.create({
      name: `analytics-business-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    personalConnectionId = personalConnection.id
    businessConnectionId = businessConnection.id
    await repositories.sessions.create({
      id: personalSessionId,
      connectionId: personalConnection.id,
      accountScope: "personal",
      name: `analytics-personal-session-${crypto.randomUUID()}`,
      wahaSessionName: `analytics-personal-waha-${crypto.randomUUID()}`,
      status: "WORKING",
    })
    await repositories.sessions.create({
      id: businessSessionId,
      connectionId: businessConnection.id,
      accountScope: "business",
      name: `analytics-business-session-${crypto.randomUUID()}`,
      wahaSessionName: `analytics-business-waha-${crypto.randomUUID()}`,
      status: "WORKING",
    })
    const personalPayload = cipher.encrypt(
      JSON.stringify({ id: "personal-message", fromMe: true }),
      {
        accountScope: "personal",
      },
    )
    const businessPayload = cipher.encrypt(
      JSON.stringify({ id: "business-message", fromMe: false }),
      {
        accountScope: "business",
      },
    )
    await repositories.normalizedEvents.create({
      sessionId: personalSessionId,
      accountScope: "personal",
      eventType: "message.waiting",
      providerEventId: `analytics-personal-event-${crypto.randomUUID()}`,
      requestId: `analytics-personal-request-${crypto.randomUUID()}`,
      payloadCiphertext: personalPayload.ciphertext,
      payloadNonce: personalPayload.nonce,
      payloadAuthTag: personalPayload.authTag,
      occurredAt: new Date("2026-01-01T01:00:00.000Z"),
    })
    await repositories.normalizedEvents.create({
      sessionId: businessSessionId,
      accountScope: "business",
      eventType: "message.waiting",
      providerEventId: `analytics-business-event-${crypto.randomUUID()}`,
      requestId: `analytics-business-request-${crypto.randomUUID()}`,
      payloadCiphertext: businessPayload.ciphertext,
      payloadNonce: businessPayload.nonce,
      payloadAuthTag: businessPayload.authTag,
      occurredAt: new Date("2026-01-01T01:00:00.000Z"),
    })
  })

  it("reads encrypted events through the real scoped PostgreSQL source", async () => {
    // Given Personal and Business events persisted in the real PostgreSQL boundary
    const source = createAnalyticsSource(database, masterKey)

    // When the Personal source is read for the bounded window
    const result = await source.read(
      "personal",
      {
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-01-02T00:00:00.000Z"),
      },
      [personalSessionId],
    )

    // Then only Personal rows are decrypted and returned to the projection seam
    expect(result.sessions).toHaveLength(1)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.accountScope).toBe("personal")
    expect(result.events[0]?.payload).toEqual({ id: "personal-message", fromMe: true })
  })

  afterAll(async () => {
    if (!database || !repositories) return
    await repositories.sessions.remove(personalSessionId, "personal")
    await repositories.sessions.remove(businessSessionId, "business")
    await database.sql`delete from waha_connections where id in (${personalConnectionId}, ${businessConnectionId})`
    await database.close()
  })
})
