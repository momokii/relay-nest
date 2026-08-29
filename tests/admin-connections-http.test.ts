import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"

import type { AuthPrincipal } from "../apps/api/src/auth/service"
import {
  type ConnectionRouteRepositories,
  registerConnectionRoutes,
} from "../apps/api/src/waha/connection-http"

const adminPrincipal: AuthPrincipal = {
  userId: "admin-1",
  email: "admin@example.invalid",
  displayName: "Admin",
  roles: ["admin"],
  rolesByScope: { personal: ["admin"], business: ["admin"] },
  sessionId: "auth-session-1",
  sessionToken: "opaque-token",
  csrfToken: "opaque-csrf",
}

const operatorPrincipal: AuthPrincipal = {
  ...adminPrincipal,
  userId: "operator-1",
  roles: ["operator"],
  rolesByScope: { personal: ["operator"], business: [] },
}

function createAuth(principal: AuthPrincipal | null) {
  return {
    authenticate: async (token: string | undefined) => (token === "valid-token" ? principal : null),
  }
}

const repositories: ConnectionRouteRepositories = {
  wahaConnections: {
    listActive: async () => [
      {
        id: "24dfd2ff-a38f-40f9-a5e3-456fc21349b1",
        name: "bundled-waha",
        baseUrl: "http://waha:3000",
      },
    ],
  },
}

async function createTestApp(principal: AuthPrincipal | null) {
  const app = Fastify()
  registerConnectionRoutes(app, createAuth(principal), repositories)
  await app.ready()
  return app
}

describe("admin connections HTTP surface", () => {
  it("requires authentication before listing connections", async () => {
    // Given an unauthenticated request to the admin connections route
    const app = await createTestApp(null)

    // When the request is made without the session cookie
    const response = await app.inject({ method: "GET", url: "/admin/connections" })

    // Then the route returns only the authentication error
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: "unauthenticated" })
  })

  it("denies non-Admin roles from listing connections", async () => {
    // Given an authenticated Operator without admin roles in any scope
    const app = await createTestApp(operatorPrincipal)

    // When the connections are requested
    const response = await app.inject({
      method: "GET",
      url: "/admin/connections",
      cookies: { waha_session: "valid-token" },
    })

    // Then the route denies the listing
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: "forbidden" })
  })

  it("lists active connections without provider credentials", async () => {
    // Given an authenticated Admin and one active bundled connection
    const app = await createTestApp(adminPrincipal)

    // When the connections are requested
    const response = await app.inject({
      method: "GET",
      url: "/admin/connections",
      cookies: { waha_session: "valid-token" },
    })

    // Then only connection summaries are returned and key material is absent
    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      connections: (Record<string, unknown> | undefined)[]
    }
    expect(body.connections).toHaveLength(1)
    expect(body.connections[0]).toEqual({
      id: "24dfd2ff-a38f-40f9-a5e3-456fc21349b1",
      name: "bundled-waha",
      baseUrl: "http://waha:3000",
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain("apiKey")
    expect(serialized).not.toContain("ciphertext")
  })
})
