import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { createWahaClient, type WahaClient } from "../apps/api/src/waha/adapter"
import type { WahaConnectionRepository, WahaStoredConnection } from "../apps/api/src/waha/config"
import {
  assertAdminRole,
  createWahaConnectionConfig,
  createWahaRuntimeSettingsService,
} from "../apps/api/src/waha/config"
import {
  WahaCapabilityError,
  WahaHttpError,
  WahaRequestCancelledError,
  WahaResponseError,
} from "../apps/api/src/waha/errors"
import { validateWahaBaseUrl, WahaConnectionUrlError } from "../apps/api/src/waha/url-policy"

type RequestRecord = {
  readonly method: string
  readonly path: string
  readonly apiKey: string | undefined
}

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections()
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse, record: RequestRecord) => void,
): Promise<{ readonly url: string; readonly records: RequestRecord[] }> {
  const records: RequestRecord[] = []
  const server = createServer((request, response) => {
    const record = {
      method: request.method ?? "",
      path: request.url ?? "",
      apiKey: request.headers["x-api-key"],
    }
    records.push(record)
    handler(request, response, record)
  })
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("test server did not bind")
  return { url: `http://127.0.0.1:${address.port}`, records }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

function createClient(baseUrl: string, options: { readonly timeoutMs?: number } = {}): WahaClient {
  return createWahaClient({
    baseUrl,
    apiKey: "master-secret-key",
    allowLoopback: true,
    timeoutMs: options.timeoutMs ?? 500,
  })
}

describe("WAHA adapter contract", () => {
  it("uses the matrix paths and server-only X-Api-Key for health negotiation", async () => {
    // Given a local WAHA-shaped HTTP service with the documented health endpoints
    const server = await startServer((request, response) => {
      if (request.url === "/ping") json(response, 200, { message: "pong" })
      else if (request.url === "/api/server/version") {
        json(response, 200, {
          version: "2026.8.1",
          engine: "WEBJS",
          tier: "PLUS",
          browser: "chrome",
          platform: "linux/x86",
          worker: { id: "worker-1" },
        })
      } else if (request.url === "/api/server/status") {
        json(response, 200, { startTimestamp: 1, uptime: 2, worker: { id: "worker-1" } })
      } else if (request.url === "/api/server/environment") {
        json(response, 200, {
          NODE_ENV: "test",
          HOSTNAME: "waha",
          WAHA_API_KEY: "upstream-secret-key",
          DATABASE_PASSWORD: "upstream-database-password",
          TELEGRAM_BOT_TOKEN: "upstream-token",
        })
      } else if (request.url === "/api/sessions") {
        json(response, 200, [])
      } else json(response, 200, { status: "ok" })
    })
    const client = createClient(server.url)

    // When the adapter requests the service health surface
    const result = await client.checkHealth()

    // Then the transport is typed, the key is not returned, and the exact path/header are used
    expect(result.service.status).toBe("healthy")
    expect(result.sessionConnectivity.status).toBe("unknown")
    expect(result.service.environment).toEqual({ NODE_ENV: "test" })
    expect(JSON.stringify(result.service.environment)).not.toContain("upstream-secret")
    expect(server.records).toEqual([
      { method: "GET", path: "/ping", apiKey: "master-secret-key" },
      { method: "GET", path: "/health", apiKey: "master-secret-key" },
      { method: "GET", path: "/api/server/version", apiKey: "master-secret-key" },
      { method: "GET", path: "/api/server/environment", apiKey: "master-secret-key" },
      { method: "GET", path: "/api/server/status", apiKey: "master-secret-key" },
      { method: "GET", path: "/api/sessions", apiKey: "master-secret-key" },
    ])
    expect(JSON.stringify(result)).not.toContain("master-secret-key")
  })

  it("classifies 401 without exposing the API key or upstream body", async () => {
    // Given a WAHA service rejecting the server credential with a secret-bearing body
    const server = await startServer((_request, response) => {
      json(response, 401, { error: "master-secret-key leaked by upstream" })
    })

    // When the adapter calls a documented endpoint
    const failure = createClient(server.url).ping()

    // Then the failure is typed and redacted
    await expect(failure).rejects.toBeInstanceOf(WahaHttpError)
    await expect(failure).rejects.toMatchObject({ status: 401, classification: "authentication" })
    await expect(failure).rejects.not.toThrow("master-secret-key")
  })

  it("rejects malformed responses at the HTTP boundary", async () => {
    // Given a service returning a body that is not a PingResponse
    const server = await startServer((_request, response) => json(response, 200, { status: "ok" }))

    // When the adapter parses ping
    const failure = createClient(server.url).ping()

    // Then malformed external data is a typed response error
    await expect(failure).rejects.toBeInstanceOf(WahaResponseError)
  })

  it("accepts documented empty-body success responses for delete and linking operations", async () => {
    // Given WAHA operations documented with no response body
    const server = await startServer((request, response) => {
      if (request.url?.includes("passkey")) {
        response.writeHead(204)
        response.end()
        return
      }
      response.writeHead(200)
      response.end()
    })
    const client = createClient(server.url)

    // When delete, pairing, passkey assertion, and passkey confirmation succeed without bodies
    await client.remove("personal")
    await client.requestPairingCode("personal", "+628123456789")
    await client.passkeyAssertion("personal", JSON.stringify({ response: "opaque" }))
    await client.confirmPasskey("personal")

    // Then each operation completes and uses its documented upstream path
    expect(server.records.map((record) => record.path)).toEqual([
      "/api/sessions/personal",
      "/api/personal/auth/request-code",
      "/api/personal/auth/passkey",
      "/api/personal/auth/passkey/confirm",
    ])
  })

  it("rejects non-empty bodies for operations documented without a response body", async () => {
    // Given an upstream success response containing an unexpected body
    const server = await startServer((_request, response) =>
      json(response, 200, { accepted: true }),
    )

    // When the adapter reads an empty-body operation
    const failure = createClient(server.url).confirmPasskey("personal")

    // Then the unexpected body is still treated as malformed
    await expect(failure).rejects.toBeInstanceOf(WahaResponseError)
  })

  it("classifies stale versions and unsupported capabilities without restarting", async () => {
    // Given a healthy but unsupported WAHA engine/version
    const server = await startServer((request, response) => {
      if (request.url === "/api/server/version") {
        json(response, 200, {
          version: "2025.1.1",
          engine: "NOWEB",
          tier: "PLUS",
          browser: "none",
          platform: "linux/x86",
          worker: { id: "worker-1" },
        })
        return
      }
      json(response, 200, request.url === "/ping" ? { message: "pong" } : { status: "ok" })
    })
    const client = createClient(server.url)

    // When capability negotiation asks for a capability requiring the pinned contract
    await expect(client.negotiateCapabilities()).rejects.toBeInstanceOf(WahaCapabilityError)

    // Then no restart endpoint is called
    expect(server.records.some((record) => record.path.includes("restart"))).toBe(false)
  })

  it("classifies 463 and 475 as visible safety states", async () => {
    // Given a service reporting outreach safety gates
    const server = await startServer((_request, response) =>
      json(response, 463, { error: "secret" }),
    )

    // When the adapter reads a health endpoint
    const first = createClient(server.url).ping()
    await expect(first).rejects.toMatchObject({ classification: "timelock" })

    const cappedServer = await startServer((_request, response) =>
      json(response, 475, { error: "secret" }),
    )
    const second = createClient(cappedServer.url).ping()

    // Then the adapter never translates those states into a restart
    await expect(second).rejects.toMatchObject({ classification: "capping" })
    expect(cappedServer.records.some((record) => record.path.includes("restart"))).toBe(false)
  })

  it("supports timeout and caller cancellation as distinct typed failures", async () => {
    // Given a service that never completes the response
    const server = await startServer((_request, _response) => undefined)

    // When the adapter timeout expires
    const timeout = createClient(server.url, { timeoutMs: 10 }).ping()
    await expect(timeout).rejects.toMatchObject({ classification: "timeout" })

    // When the caller cancels an in-flight request
    const controller = new AbortController()
    const cancelled = createClient(server.url).ping(controller.signal)
    controller.abort()

    // Then cancellation is not misreported as a service failure
    await expect(cancelled).rejects.toBeInstanceOf(WahaRequestCancelledError)
  })

  it("rejects unsafe URLs while allowing the bundled service reference", () => {
    // Given untrusted runtime URL candidates
    const blockedAddresses = [
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "[::ffff:127.0.0.1]",
      "[::ffff:10.0.0.1]",
    ]
    for (const address of blockedAddresses) {
      expect(() => validateWahaBaseUrl(`http://${address}:3000`)).toThrow(WahaConnectionUrlError)
    }
    expect(() => validateWahaBaseUrl("http://127.0.0.1:3000")).toThrow(WahaConnectionUrlError)
    expect(() => validateWahaBaseUrl("http://[::1]:3000")).toThrow(WahaConnectionUrlError)
    expect(() => validateWahaBaseUrl("http://10.0.0.1:3000", true)).toThrow(WahaConnectionUrlError)
    expect(validateWahaBaseUrl("http://127.0.0.1:3000", true).hostname).toBe("127.0.0.1")
    expect(validateWahaBaseUrl("http://[::1]:3000", true).hostname).toBe("[::1]")

    // When the bundled service reference is configured
    const bundled = validateWahaBaseUrl("http://waha:3000")
    const external = validateWahaBaseUrl("https://waha.example.com")

    // Then it is accepted as an internal deployment reference
    expect(bundled.toString()).toBe("http://waha:3000/")
    expect(external.protocol).toBe("https:")
  })

  it("persists only an encrypted runtime credential and requires Admin role", () => {
    // Given a runtime connection configuration boundary
    const config = createWahaConnectionConfig({
      name: "bundled",
      baseUrl: "http://waha:3000",
      apiKey: "master-secret-key",
      active: true,
    })

    // Then the adapter config remains server-only and role checks are explicit
    expect(config.apiKey).toBe("master-secret-key")
    expect(() => assertAdminRole("operator")).toThrow("Admin")
    expect(() => assertAdminRole("admin")).not.toThrow()
  })

  it("encrypts an Admin runtime setting before repository persistence", async () => {
    // Given an in-memory repository seam and an application encryption key
    const saved: WahaStoredConnection[] = []
    const repository: WahaConnectionRepository = {
      create: async (input) => {
        saved.push(input)
        return { id: "connection-1", ...input }
      },
      update: async (_id, input) => {
        saved.push(input)
        return { id: "connection-1", ...input }
      },
    }
    const service = createWahaRuntimeSettingsService(repository, Buffer.alloc(32, 7))

    // When an Admin saves the runtime connection
    await service.save("admin", {
      name: "bundled",
      baseUrl: "http://waha:3000",
      apiKey: "master-secret-key",
      active: true,
    })

    // Then persistence receives ciphertext and never the plaintext key
    expect(saved[0]?.apiKeyCiphertext).toBeTypeOf("string")
    expect(JSON.stringify(saved)).not.toContain("master-secret-key")
  })
})
