import Fastify from "fastify"
import { describe, expect, it } from "vitest"

import type { AuthPrincipal } from "./auth/service"
import { CampaignForbiddenError } from "./campaigns"
import { registerCampaignRoutes } from "./campaigns-http"

const personalCampaign = {
  id: "11111111-1111-4111-8111-111111111111",
  accountScope: "personal" as const,
  sessionId: "22222222-2222-4222-8222-222222222222",
  contactGroupId: "33333333-3333-4333-8333-333333333333",
  wahaGroupId: "120@g.us",
  trigger: { type: "any" },
  scheduledAt: new Date("2030-01-01T12:00:00.000Z"),
  state: "scheduled" as const,
  createdBy: "44444444-4444-4444-8444-444444444444",
  schedulerJobId: null,
  followUpMessage: null,
}

const principal: AuthPrincipal = {
  userId: personalCampaign.createdBy,
  email: "operator@example.test",
  displayName: "Operator",
  roles: ["operator"],
  rolesByScope: { personal: ["operator"], business: [] },
  sessionId: "55555555-5555-4555-8555-555555555555",
  sessionToken: "session-token",
  csrfToken: "csrf-token",
}

function createTestApp(
  list: (scope: "personal" | "business") => Promise<
    Readonly<{
      items: readonly (typeof personalCampaign)[]
      hasMore: boolean
    }>
  >,
) {
  const app = Fastify()
  registerCampaignRoutes(
    app,
    {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    },
    {
      schedule: async () => personalCampaign,
      list: async (_principal, scope, pageSize, offset) => {
        const result = await list(scope)
        expect(pageSize).toBeLessThanOrEqual(50)
        expect(offset).toBeGreaterThanOrEqual(0)
        return result
      },
    },
  )
  return app
}

describe("scoped campaign HTTP routes", () => {
  it("lets Personal see only its campaigns", async () => {
    const app = createTestApp(async (scope) =>
      scope === "personal"
        ? { items: [personalCampaign], hasMore: false }
        : { items: [], hasMore: false },
    )
    const response = await app.inject({ url: "/scoped/campaigns?scope=personal" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      items: [{ id: personalCampaign.id, accountScope: "personal", state: "scheduled" }],
      page: 1,
      pageSize: 20,
    })
    expect(response.body).not.toContain("Ciphertext")
  })

  it("returns an empty Business page when Business has no campaigns", async () => {
    const app = createTestApp(async () => ({ items: [], hasMore: false }))
    const response = await app.inject({ url: "/scoped/campaigns?scope=business" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ items: [], pageSize: 20 })
  })

  it("caps an oversized pageSize at 50", async () => {
    const app = createTestApp(async () => ({ items: [], hasMore: false }))
    const response = await app.inject({ url: "/scoped/campaigns?scope=personal&pageSize=100" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ pageSize: 50 })
  })

  it("rejects a Viewer without a campaign grant", async () => {
    const app = Fastify()
    registerCampaignRoutes(
      app,
      {
        authenticate: async () => ({ ...principal, roles: ["viewer"] }),
        verifyCsrf: async () => true,
      },
      {
        schedule: async () => personalCampaign,
        list: async () => {
          throw new CampaignForbiddenError("campaign is not granted in this scope")
        },
      },
    )
    const response = await app.inject({ url: "/scoped/campaigns?scope=personal" })

    expect(response.statusCode).toBe(403)
  })
})
