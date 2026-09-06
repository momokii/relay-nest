import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"
import { z } from "../apps/api/node_modules/zod"

import type { AuthPrincipal } from "../apps/api/src/auth/service"
import {
  CampaignForbiddenError,
  CampaignInputError,
  type CampaignPrincipal,
  type CampaignRecord,
  createCampaignService,
} from "../apps/api/src/campaigns"
import { registerCampaignRoutes } from "../apps/api/src/campaigns-http"
import type { PersistenceDatabase } from "../apps/api/src/db/client"
import { createCampaignRepository } from "../apps/api/src/db/repositories/campaigns"

const scope = "personal" as const
const principal: CampaignPrincipal = { userId: "user-1", roles: ["operator"] }
const scheduledFor = new Date("2030-01-01T12:00:00.000Z")

function campaignFixture(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "campaign-1",
    accountScope: scope,
    sessionId: "session-1",
    contactGroupId: "group-1",
    wahaGroupId: "120@g.us",
    trigger: { type: "any" },
    scheduledAt: scheduledFor,
    state: "cancelled",
    createdBy: "user-1",
    schedulerJobId: "job-1",
    followUpMessage: null,
    ...overrides,
  }
}

type CampaignDeps = Parameters<typeof createCampaignService>[0]

function service(
  initial: CampaignRecord,
  overrides: Partial<CampaignDeps> = {},
): {
  campaigns: ReturnType<typeof createCampaignService>
  events: readonly string[]
  removed: readonly { id: string; removeScope: "personal" | "business" }[]
  current: () => CampaignRecord | null
} {
  const events: string[] = []
  const removed: { id: string; removeScope: "personal" | "business" }[] = []
  let current: CampaignRecord | null = initial
  const dependencies: CampaignDeps = {
    campaigns: {
      create: async () => {
        throw new Error("create is not used by delete tests")
      },
      attachSchedulerJob: async () => null,
      markSent: async () => undefined,
      markFailed: async () => undefined,
      list: async () => [],
      find: async () => current,
      cancel: async () => null,
      updateContactGroup: async () => null,
      remove: async (id, removeScope) => {
        events.push("campaigns:remove")
        removed.push({ id, removeScope })
        if (
          !current ||
          current.state === "scheduled" ||
          id !== current.id ||
          removeScope !== current.accountScope
        )
          return false
        current = null
        return true
      },
    },
    sessions: { find: async () => null },
    contactGroups: { hasGrant: async () => true },
    authorize: async () => ({ allowed: true }),
    scheduler: {
      schedule: async () => ({ jobId: "job-1", duplicate: false }),
      cancel: async () => {
        events.push("scheduler:cancel")
        return null
      },
    },
    wahaForSession: async () => ({
      groups: async () => [],
      sendText: async () => ({ id: "message-1" }),
    }),
    ...overrides,
  }
  return {
    campaigns: createCampaignService(dependencies),
    events,
    removed,
    current: () => current,
  }
}

describe("campaign delete service", () => {
  it("delete removes terminal campaigns", async () => {
    const context = service(campaignFixture({ state: "cancelled" }))
    await context.campaigns.remove(principal, "campaign-1", scope)
    expect(context.removed).toEqual([{ id: "campaign-1", removeScope: scope }])
    expect(context.current()).toBeNull()
  })

  it("delete also removes sent and failed campaigns without touching the scheduler", async () => {
    for (const state of ["sent", "failed"] as const) {
      const context = service(campaignFixture({ state }))
      await context.campaigns.remove(principal, "campaign-1", scope)
      expect(context.removed).toEqual([{ id: "campaign-1", removeScope: scope }])
      expect(context.events).toEqual(["campaigns:remove"])
    }
  })

  it("delete of a scheduled campaign fails and leaves the row untouched", async () => {
    const context = service(campaignFixture({ state: "scheduled" }))
    await expect(context.campaigns.remove(principal, "campaign-1", scope)).rejects.toBeInstanceOf(
      CampaignInputError,
    )
    expect(context.events).toEqual([])
    expect(context.current()).not.toBeNull()
  })

  it("delete rejects a cross-user request with a forbidden error and leaks nothing", async () => {
    const context = service(campaignFixture({ createdBy: "user-2" }))
    await expect(context.campaigns.remove(principal, "campaign-1", scope)).rejects.toBeInstanceOf(
      CampaignForbiddenError,
    )
    expect(context.events).toEqual([])
    expect(context.current()).not.toBeNull()
  })

  it("delete is forbidden when the row disappears or leaves scheduled state before the delete", async () => {
    // Simulate a concurrent deletion/state change: repository remove returns false.
    const race = service(campaignFixture(), {
      campaigns: {
        create: async () => {
          throw new Error("not used")
        },
        attachSchedulerJob: async () => null,
        markSent: async () => undefined,
        markFailed: async () => undefined,
        list: async () => [],
        find: async () => campaignFixture(),
        cancel: async () => null,
        updateContactGroup: async () => null,
        remove: async () => false,
      },
    })
    await expect(race.campaigns.remove(principal, "campaign-1", scope)).rejects.toBeInstanceOf(
      CampaignForbiddenError,
    )
  })
})

const campaignId = "11111111-1111-4111-8111-111111111111"
const creatorId = "44444444-4444-4444-8444-444444444444"

const authPrincipal: AuthPrincipal = {
  userId: creatorId,
  email: "operator@example.test",
  displayName: "Operator",
  roles: ["operator"],
  rolesByScope: { personal: ["operator"], business: [] },
  sessionId: "55555555-5555-4555-8555-555555555555",
  sessionToken: "session-token",
  csrfToken: "csrf-token",
}

describe("campaign delete http route", () => {
  function createTestApp(
    options: {
      remove?: (
        principal: CampaignPrincipal,
        id: string,
        scope: "personal" | "business",
      ) => Promise<void>
      verifyCsrf?: (token: string | undefined, csrfToken: string | undefined) => Promise<boolean>
    } = {},
  ) {
    const app = Fastify()
    // Mirror the API error handler so Zod parse failures map to 400 like app.ts.
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: "invalid request" })
      throw error
    })
    const removeCalls: { id: string; scope: "personal" | "business" }[] = []
    registerCampaignRoutes(
      app,
      {
        authenticate: async () => authPrincipal,
        verifyCsrf: options.verifyCsrf ?? (async (_token, csrfToken) => csrfToken === "csrf-token"),
      },
      {
        schedule: async () => campaignFixture(),
        remove:
          options.remove ??
          (async (_principal, id, removeScope) => {
            removeCalls.push({ id, scope: removeScope })
          }),
      },
    )
    return { app, removeCalls }
  }

  it("DELETE removes a terminal campaign for the creator with same-origin and CSRF", async () => {
    const { app, removeCalls } = createTestApp()
    const sameOriginHeaders = { host: "localhost", origin: "http://localhost" }
    const response = await app.inject({
      method: "DELETE",
      url: `/scoped/campaigns/${campaignId}?scope=personal`,
      headers: { ...sameOriginHeaders, "x-csrf-token": "csrf-token" },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    expect(response.body).not.toContain("ciphertext")
    expect(removeCalls).toEqual([{ id: campaignId, scope: "personal" }])

    // Requests without an Origin header (same-app clients) are also accepted.
    const noOrigin = await app.inject({
      method: "DELETE",
      url: `/scoped/campaigns/${campaignId}?scope=personal`,
      headers: { "x-csrf-token": "csrf-token" },
    })
    expect(noOrigin.statusCode).toBe(200)
    expect(removeCalls).toEqual([
      { id: campaignId, scope: "personal" },
      { id: campaignId, scope: "personal" },
    ])
  })

  it("DELETE is rejected without a valid CSRF token before the service is called", async () => {
    const { app, removeCalls } = createTestApp()
    const response = await app.inject({
      method: "DELETE",
      url: `/scoped/campaigns/${campaignId}?scope=personal`,
      headers: { origin: "http://localhost" },
    })
    expect(response.statusCode).toBe(403)
    expect(removeCalls).toEqual([])
  })

  it("DELETE is rejected for a cross-origin request before the service is called", async () => {
    const { app, removeCalls } = createTestApp()
    const response = await app.inject({
      method: "DELETE",
      url: `/scoped/campaigns/${campaignId}?scope=personal`,
      headers: { origin: "https://evil.example", "x-csrf-token": "csrf-token" },
    })
    expect(response.statusCode).toBe(403)
    expect(removeCalls).toEqual([])
  })

  it("DELETE maps a cross-user delete to 403 without leaking the row", async () => {
    const { app } = createTestApp({
      remove: async () => {
        throw new CampaignForbiddenError("campaign not found")
      },
    })
    const response = await app.inject({
      method: "DELETE",
      url: `/scoped/campaigns/${campaignId}?scope=personal`,
      headers: { "x-csrf-token": "csrf-token" },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: "forbidden" })
  })

  it("DELETE maps a scheduled-campaign delete to 400 and malformed ids to 400", async () => {
    const { app } = createTestApp({
      remove: async () => {
        throw new CampaignInputError("only terminal campaigns can be deleted")
      },
    })
    const scheduled = await app.inject({
      method: "DELETE",
      url: `/scoped/campaigns/${campaignId}?scope=personal`,
      headers: { "x-csrf-token": "csrf-token" },
    })
    expect(scheduled.statusCode).toBe(400)
    expect(scheduled.json()).toEqual({ error: "invalid request" })

    const malformed = await app.inject({
      method: "DELETE",
      url: "/scoped/campaigns/not-a-uuid?scope=personal",
      headers: { "x-csrf-token": "csrf-token" },
    })
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json()).toEqual({ error: "invalid request" })
  })

  it("DELETE responds 503 when the delete capability is unavailable", async () => {
    const app = Fastify()
    registerCampaignRoutes(
      app,
      { authenticate: async () => authPrincipal, verifyCsrf: async () => true },
      { schedule: async () => campaignFixture() },
    )
    const response = await app.inject({
      method: "DELETE",
      url: `/scoped/campaigns/${campaignId}?scope=personal`,
      headers: { "x-csrf-token": "csrf-token" },
    })
    expect(response.statusCode).toBe(503)
  })
})

describe("campaign repository remove", () => {
  const masterKey = randomBytes(32)

  function createFakeDb(results: readonly unknown[][]): PersistenceDatabase {
    const next = (): unknown[] => {
      const result = results.shift()
      if (result === undefined) throw new Error("fake database result queue exhausted")
      return result
    }
    const build = (): Record<string, unknown> => {
      const builder: Record<string, unknown> = {}
      for (const method of [
        "from",
        "leftJoin",
        "where",
        "orderBy",
        "limit",
        "offset",
        "values",
        "set",
      ])
        builder[method] = () => builder
      builder.returning = () => Promise.resolve(next())
      // biome-ignore lint/suspicious/noThenProperty: fake drizzle query builder is intentionally thenable
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(next()).then(resolve, reject)
      return builder
    }
    return {
      insert: () => build(),
      select: () => build(),
      update: () => build(),
      delete: () => build(),
    } as unknown as PersistenceDatabase
  }

  it("remove returns true only when a scoped terminal row is deleted", async () => {
    const repository = createCampaignRepository(createFakeDb([[{ id: campaignId }]]), masterKey)
    await expect(repository.remove?.(campaignId, "personal")).resolves.toBe(true)

    const empty = createCampaignRepository(createFakeDb([[]]), masterKey)
    await expect(empty.remove?.(campaignId, "personal")).resolves.toBe(false)
  })
})
