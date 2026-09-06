import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"

import type { AuthPrincipal } from "../apps/api/src/auth/service"
import { type CampaignPrincipal, createCampaignService } from "../apps/api/src/campaigns"
import { registerCampaignRoutes } from "../apps/api/src/campaigns-http"
import type { PersistenceDatabase } from "../apps/api/src/db/client"
import { createCampaignRepository } from "../apps/api/src/db/repositories/campaigns"
import { createEnvelopeCipher } from "../packages/config/src/encryption"

const campaignId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"
const contactGroupId = "33333333-3333-4333-8333-333333333333"
const creatorId = "44444444-4444-4444-8444-444444444444"

const displayFields = {
  wahaGroupSubject: "Project Alfa",
  messagePreview: "hello group",
  timezone: "Asia/Jakarta",
}

const enrichedCampaign = {
  id: campaignId,
  accountScope: "personal" as const,
  sessionId,
  contactGroupId,
  wahaGroupId: "1203630253@g.us",
  ...displayFields,
  trigger: { type: "any" },
  scheduledAt: new Date("2030-01-01T12:00:00.000Z"),
  state: "scheduled" as const,
  createdBy: creatorId,
  schedulerJobId: null,
  followUpMessage: null,
}

const principal: AuthPrincipal = {
  userId: creatorId,
  email: "operator@example.test",
  displayName: "Operator",
  roles: ["operator"],
  rolesByScope: { personal: ["operator"], business: [] },
  sessionId: "55555555-5555-4555-8555-555555555555",
  sessionToken: "session-token",
  csrfToken: "csrf-token",
}

function createTestApp(
  overrides: {
    schedule?: Parameters<typeof registerCampaignRoutes>[2]["schedule"]
    find?: Parameters<typeof registerCampaignRoutes>[2]["find"]
  } = {},
) {
  const app = Fastify()
  registerCampaignRoutes(
    app,
    {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    },
    {
      schedule: overrides.schedule ?? (async () => enrichedCampaign),
      list: async (_principal, scope) =>
        scope === "personal"
          ? { items: [enrichedCampaign], hasMore: false }
          : { items: [], hasMore: false },
      find: overrides.find ?? (async () => enrichedCampaign),
    },
  )
  return app
}

function expectDisplayFields(value: unknown, label: string): void {
  expect(value, label).toMatchObject(displayFields)
  const record = value as Record<string, unknown>
  for (const key of ["wahaGroupSubject", "messagePreview", "timezone"])
    expect(Object.hasOwn(record, key), `${label} exposes ${key}`).toBe(true)
}

describe("campaign display enrichment", () => {
  it("campaign responses expose display fields", async () => {
    const app = createTestApp()

    const list = await app.inject({ url: "/scoped/campaigns?scope=personal" })
    expect(list.statusCode).toBe(200)
    const listed = list.json() as { items: unknown[] }
    expect(listed.items).toHaveLength(1)
    expectDisplayFields(listed.items[0], "list item")
    expect(list.body).not.toContain("ciphertext")
    expect(list.body).not.toContain("nonce")
    expect(list.body).not.toContain("authTag")

    const created = await app.inject({
      method: "POST",
      url: "/scoped/campaigns?scope=personal",
      payload: {
        sessionId,
        contactGroupId,
        wahaGroupId: "1203630253@g.us",
        message: "hello group",
        trigger: { type: "any" },
      },
    })
    expect(created.statusCode).toBe(201)
    expectDisplayFields(created.json(), "create response")

    const detail = await app.inject({ url: `/scoped/campaigns/${campaignId}?scope=personal` })
    expect(detail.statusCode).toBe(200)
    expectDisplayFields(detail.json(), "detail response")

    const legacy = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/campaigns?scope=personal`,
      payload: {
        contactGroupId,
        wahaGroupId: "1203630253@g.us",
        message: "hello group",
        trigger: { type: "any" },
      },
    })
    expect(legacy.statusCode).toBe(201)
    expectDisplayFields(legacy.json(), "legacy create response")
    expect(legacy.body).not.toContain("ciphertext")
    expect(legacy.body).not.toContain("nonce")
    expect(legacy.body).not.toContain("authTag")
  })

  it("campaign responses expose null display fields for malformed minimal input", async () => {
    const app = createTestApp({
      schedule: async () => ({
        ...enrichedCampaign,
        wahaGroupId: null,
        wahaGroupSubject: null,
        messagePreview: "plain text message",
        timezone: null,
      }),
    })
    const response = await app.inject({
      method: "POST",
      url: "/scoped/campaigns?scope=personal",
      payload: {
        sessionId,
        contactGroupId,
        message: "plain text message",
        trigger: { type: "any" },
      },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json() as Record<string, unknown>
    expect(body.wahaGroupSubject).toBeNull()
    expect(body.messagePreview).toBe("plain text message")
    expect(body.timezone).toBeNull()
  })

  it("service captures the WAHA group name as a snapshot on create", async () => {
    const scheduleInput = {
      sessionId,
      accountScope: "personal" as const,
      contactGroupId,
      wahaGroupId: "1203630253@g.us",
      message: "hello group",
      trigger: { type: "any" },
      scheduledAt: new Date("2030-01-01T12:00:00.000Z"),
    }
    const campaignPrincipal: CampaignPrincipal = { userId: creatorId, roles: ["operator"] }
    const session = {
      id: sessionId,
      accountScope: "personal" as const,
      wahaSessionName: "personal",
    }

    const serviceWith = (groups: readonly { id: string; name?: string }[]) =>
      createCampaignService({
        campaigns: {
          create: async (value) => ({
            id: campaignId,
            accountScope: value.accountScope,
            sessionId: value.sessionId,
            contactGroupId: value.contactGroupId,
            wahaGroupId: value.wahaGroupId,
            wahaGroupSubject: value.wahaGroupSubject,
            trigger: value.trigger,
            scheduledAt: value.scheduledAt,
            state: "scheduled" as const,
            createdBy: value.createdBy,
            schedulerJobId: null,
            followUpMessage: null,
          }),
          attachSchedulerJob: async () => null,
          markSent: async () => undefined,
          markFailed: async () => undefined,
          list: async () => [],
          find: async () => null,
          cancel: async () => null,
          updateContactGroup: async () => null,
        },
        sessions: { find: async () => session },
        contactGroups: { hasGrant: async () => true },
        authorize: async () => ({ allowed: true }),
        scheduler: {
          schedule: async () => ({ jobId: "job-1", duplicate: false }),
          cancel: async () => null,
        },
        wahaForSession: async () => ({
          groups: async () => groups,
          sendText: async () => ({ id: "message-1" }),
        }),
        now: () => new Date("2029-01-01T00:00:00.000Z"),
      })

    const named = await serviceWith([{ id: "1203630253@g.us", name: "Project Alfa" }]).schedule(
      campaignPrincipal,
      scheduleInput,
    )
    expect(named.wahaGroupSubject).toBe("Project Alfa")

    const unnamed = await serviceWith([{ id: "1203630253@g.us" }]).schedule(
      campaignPrincipal,
      scheduleInput,
    )
    expect(unnamed.wahaGroupSubject).toBeNull()
  })
})

describe("campaign repository display fields", () => {
  const masterKey = randomBytes(32)
  const cipher = createEnvelopeCipher(masterKey)
  const envelope = (value: string) => cipher.encrypt(value, { accountScope: "personal" })
  const messageEnvelope = envelope("hello group")
  const longPlaintext = "x".repeat(200)

  const baseRow = {
    id: campaignId,
    accountScope: "personal" as const,
    sessionId,
    contactGroupId,
    wahaGroupId: "1203630253@g.us",
    wahaGroupSubject: "Project Alfa",
    messageCiphertext: messageEnvelope.ciphertext,
    messageNonce: messageEnvelope.nonce,
    messageAuthTag: messageEnvelope.authTag,
    followUpMessageCiphertext: null,
    followUpMessageNonce: null,
    followUpMessageAuthTag: null,
    trigger: { type: "any" },
    scheduledAt: new Date("2030-01-01T12:00:00.000Z"),
    state: "scheduled" as const,
    createdBy: creatorId,
    schedulerJobId: null,
    createdAt: new Date("2029-01-01T00:00:00.000Z"),
  }

  function createFakeDb(queue: readonly unknown[][]): PersistenceDatabase {
    const next = (): unknown[] => {
      const result = queue.shift()
      if (result === undefined) throw new Error("fake database result queue exhausted")
      return result
    }
    const build = (): Record<string, unknown> => {
      let stored: Record<string, unknown> | undefined
      const builder: Record<string, unknown> = {}
      for (const method of ["from", "leftJoin", "where", "orderBy", "limit", "offset"])
        builder[method] = () => builder
      builder.values = (value: Record<string, unknown>) => {
        stored = value
        return builder
      }
      builder.set = (value: Record<string, unknown>) => {
        stored = value
        return builder
      }
      builder.returning = () => Promise.resolve([{ ...baseRow, ...stored }])
      // biome-ignore lint/suspicious/noThenProperty: fake drizzle query builder is intentionally thenable
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(next()).then(resolve, reject)
      return builder
    }
    return {
      insert: () => build(),
      select: () => build(),
      update: () => build(),
    } as unknown as PersistenceDatabase
  }

  it("message preview is decrypted and truncated to 120 characters", async () => {
    const repository = createCampaignRepository(createFakeDb([]), masterKey)
    const created = await repository.create({
      accountScope: "personal",
      sessionId,
      contactGroupId,
      wahaGroupId: "1203630253@g.us",
      wahaGroupSubject: "Project Alfa",
      message: longPlaintext,
      trigger: { type: "any" },
      scheduledAt: new Date("2030-01-01T12:00:00.000Z"),
      createdBy: creatorId,
    })
    expect(created.messagePreview).toHaveLength(120)
    expect(created.messagePreview).toBe(longPlaintext.slice(0, 120))

    const short = await repository.create({
      accountScope: "personal",
      sessionId,
      contactGroupId,
      wahaGroupId: null,
      wahaGroupSubject: null,
      message: "hello group",
      trigger: { type: "any" },
      scheduledAt: new Date("2030-01-01T12:00:00.000Z"),
      createdBy: creatorId,
    })
    expect(short.messagePreview).toBe("hello group")
    expect(short.wahaGroupSubject).toBeNull()
    expect(Object.hasOwn(short, "timezone")).toBe(true)
  })

  it("find and list surface the scheduled job timezone through the join", async () => {
    const repository = createCampaignRepository(
      createFakeDb([
        [{ campaign: baseRow, timezone: "Asia/Jakarta" }],
        [{ campaign: baseRow, timezone: "Asia/Jakarta" }],
      ]),
      masterKey,
    )
    const found = await repository.find(campaignId, "personal")
    expect(found?.timezone).toBe("Asia/Jakarta")
    expect(found?.messagePreview).toBe("hello group")
    expect(found?.wahaGroupSubject).toBe("Project Alfa")

    const listed = await repository.list("personal", creatorId, 10, 0)
    expect(listed[0]?.timezone).toBe("Asia/Jakarta")
  })

  it("attachSchedulerJob returns the linked job timezone", async () => {
    const repository = createCampaignRepository(createFakeDb([[{ timezone: "UTC" }]]), masterKey)
    const attached = await repository.attachSchedulerJob(campaignId, "personal", campaignId)
    expect(attached?.timezone).toBe("UTC")
    expect(attached?.schedulerJobId).toBe(campaignId)
  })
})
