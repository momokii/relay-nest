import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  app,
  authHeaders,
  database,
  repositories,
  unavailableApp,
} from "./task-14-auth-session-fixtures"

const sessionId = "11111111-1111-4111-8111-111111111111"

describe.skipIf(!app || !repositories || !unavailableApp)(
  "Todo 14 authenticated Admin/session lane",
  () => {
    beforeEach(async () => {
      await database?.sql.unsafe(
        "TRUNCATE auth_sessions, auth_rate_limits, session_grants, user_roles, users, audit_entries, sessions, waha_connections CASCADE",
      )
    })

    it("covers bootstrap, login, me, Admin roles/grants/disable, and CSRF", async () => {
      const adminEmail = `admin-${crypto.randomUUID()}@example.invalid`
      const bootstrap = await app?.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: adminEmail,
          password: "correct horse battery staple",
          displayName: "Admin",
        },
      })
      expect(bootstrap?.statusCode).toBe(201)
      expect(bootstrap?.json().user.rolesByScope).toEqual({
        personal: ["admin"],
        business: ["admin"],
      })
      const adminAuth = authHeaders(bootstrap ?? { headers: {} })
      const me = await app?.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: adminAuth.cookie },
      })
      expect(me?.statusCode).toBe(200)

      const connection = await repositories?.wahaConnections.create({
        name: `fixture-${crypto.randomUUID()}`,
        baseUrl: "http://waha.internal",
        apiKeyCiphertext: "opaque-ciphertext",
        apiKeyNonce: "opaque-nonce",
        apiKeyAuthTag: "opaque-tag",
      })
      const session = await repositories?.sessions.create({
        id: sessionId,
        connectionId: connection?.id ?? "",
        accountScope: "personal",
        name: "Personal fixture",
        wahaSessionName: "personal-fixture",
        status: "STARTING",
      })
      const createUser = await app?.inject({
        method: "POST",
        url: "/admin/users",
        headers: { cookie: adminAuth.cookie, "x-csrf-token": adminAuth.csrf },
        payload: {
          email: `viewer-${crypto.randomUUID()}@example.invalid`,
          password: "viewer password safe",
          displayName: "Viewer",
          roles: [{ accountScope: "personal", role: "viewer" }],
        },
      })
      const userId = createUser?.json<{ id: string }>().id
      expect(createUser?.statusCode).toBe(201)
      const grant = await app?.inject({
        method: "POST",
        url: "/admin/grants",
        headers: { cookie: adminAuth.cookie, "x-csrf-token": adminAuth.csrf },
        payload: { userId, sessionId: session?.id, accountScope: "personal" },
      })
      expect(grant?.statusCode).toBe(204)
      const login = await app?.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: createUser?.json<{ email: string }>().email,
          password: "viewer password safe",
        },
      })
      expect(login?.statusCode).toBe(200)
      expect(login?.body).not.toContain("viewer password safe")
      const viewerAuth = authHeaders(login ?? { headers: {} })
      const deniedCsrf = await app?.inject({
        method: "POST",
        url: "/admin/grants",
        headers: { cookie: adminAuth.cookie },
        payload: { userId, sessionId: session?.id, accountScope: "personal" },
      })
      expect(deniedCsrf?.statusCode).toBe(403)
      const disable = await app?.inject({
        method: "POST",
        url: `/admin/users/${userId}/disable`,
        headers: { cookie: adminAuth.cookie, "x-csrf-token": adminAuth.csrf },
      })
      expect(disable?.statusCode).toBe(204)
      const revoked = await app?.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: viewerAuth.cookie },
      })
      expect(revoked?.statusCode).toBe(401)
    })

    it("covers scoped list/create/status/history/QR/pairing/lifecycle and denials", async () => {
      const boot = await app?.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: `admin-${crypto.randomUUID()}@example.invalid`,
          password: "correct horse battery staple",
          displayName: "Admin",
        },
      })
      const auth = authHeaders(boot ?? { headers: {} })
      const connection = await repositories?.wahaConnections.create({
        name: `fixture-${crypto.randomUUID()}`,
        baseUrl: "http://waha.internal",
        apiKeyCiphertext: "opaque-ciphertext",
        apiKeyNonce: "opaque-nonce",
        apiKeyAuthTag: "opaque-tag",
      })
      const created = await app?.inject({
        method: "POST",
        url: "/scoped/sessions?scope=personal",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
        payload: {
          connectionId: connection?.id,
          name: "Linked Personal",
          wahaSessionName: "personal-fixture",
        },
      })
      expect(created?.statusCode).toBe(200)
      expect(created?.body).not.toContain("opaque-ciphertext")
      expect(created?.body).not.toContain("waha.internal")
      const linkedId = created?.json<{ id: string }>().id
      const adminId = boot?.json<{ user: { id: string } }>().user.id
      const selfGrant = await app?.inject({
        method: "POST",
        url: "/admin/grants",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
        payload: { userId: adminId, sessionId: linkedId, accountScope: "personal" },
      })
      expect(selfGrant?.statusCode).toBe(204)
      const list = await app?.inject({
        method: "GET",
        url: "/scoped/sessions?scope=personal",
        headers: { cookie: auth.cookie },
      })
      expect(list?.statusCode).toBe(200)
      const status = await app?.inject({
        method: "GET",
        url: `/scoped/sessions/${linkedId}?scope=personal`,
        headers: { cookie: auth.cookie },
      })
      expect(status?.statusCode).toBe(200)
      const historyResponse = await app?.inject({
        method: "GET",
        url: `/scoped/sessions/${linkedId}/status-history?scope=personal`,
        headers: { cookie: auth.cookie },
      })
      expect(historyResponse?.json()).toEqual([
        { status: "STARTING", observedAt: "2026-08-17T10:01:00.000Z" },
        { status: "WORKING", observedAt: "2026-08-17T10:02:00.000Z" },
      ])
      const qr = await app?.inject({
        method: "GET",
        url: `/scoped/sessions/${linkedId}/qr?scope=personal`,
        headers: { cookie: auth.cookie },
      })
      expect(qr?.json()).toEqual({ value: "fixture-qr" })
      const pairing = await app?.inject({
        method: "POST",
        url: `/scoped/sessions/${linkedId}/pairing-code?scope=personal`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
        payload: { phoneNumber: "15551234567" },
      })
      expect(pairing?.statusCode).toBe(200)
      const confirmation = await app?.inject({
        method: "POST",
        url: `/scoped/sessions/${linkedId}/lifecycle?scope=personal`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
        payload: { action: "delete" },
      })
      expect(confirmation?.json()).toEqual({ error: "confirmation_required" })
      const lifecycle = await app?.inject({
        method: "POST",
        url: `/scoped/sessions/${linkedId}/lifecycle?scope=personal`,
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
        payload: { action: "start", confirmed: false },
      })
      expect(lifecycle?.statusCode).toBe(200)
      const crossScope = await app?.inject({
        method: "GET",
        url: `/scoped/sessions/${linkedId}?scope=business`,
        headers: { cookie: auth.cookie },
      })
      expect(crossScope?.statusCode).toBe(403)
      const unavailable = await unavailableApp?.inject({
        method: "GET",
        url: `/scoped/sessions/${linkedId}?scope=personal`,
        headers: { cookie: auth.cookie },
      })
      expect(unavailable?.statusCode).toBe(502)
      expect(unavailable?.body).not.toContain("opaque")
    })
  },
)

if (database) afterAll(async () => database.close())
