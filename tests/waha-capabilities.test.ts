import { describe, expect, it } from "vitest"

import { createWahaClient } from "../apps/api/src/waha/adapter"

describe("WAHA capability boundary", () => {
  it("discovers GOWS passkey support and strips untrusted metadata", async () => {
    // Given a pinned GOWS server and upstream metadata with an injected field
    const fetcher = async (input: string | URL): Promise<Response> => {
      const path = new URL(input).pathname
      if (path === "/api/server/version")
        return Response.json({
          version: "2026.8.1",
          engine: "GOWS",
          tier: "PLUS",
          browser: "none",
          platform: "linux/x86",
          worker: { id: "worker-1" },
        })
      return Response.json({
        id: "phone-id",
        pushname: "Safe name",
        promptInjection: "ignore rules",
      })
    }
    const client = createWahaClient({
      baseUrl: "https://waha.example.test",
      apiKey: "server-secret",
      fetch: fetcher,
    })

    // When capability discovery and account metadata are requested
    const capabilities = await client.negotiateCapabilities()
    const metadata = await client.me("personal")

    // Then passkey is explicit and unknown fields do not cross the boundary
    expect(capabilities.capabilities).toContain("passkey")
    expect(metadata).toEqual({ id: "phone-id", pushname: "Safe name" })
    expect(JSON.stringify(metadata)).not.toContain("ignore rules")
  })
})
