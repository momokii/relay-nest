import { describe, expect, it } from "vitest"

import { createWahaClient } from "./adapter"
import { WahaHttpError } from "./errors"

describe("WAHA group client", () => {
  it("creates, lists, and changes group participants through the server-side adapter", async () => {
    // Given a mocked WAHA endpoint with the canonical group responses
    const requests: { method: string; path: string; body: string | undefined }[] = []
    const fetcher = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(input)
      requests.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        body: typeof init?.body === "string" ? init.body : undefined,
      })
      if (init?.method === "POST" && url.pathname.endsWith("/groups"))
        return Response.json({ id: "120363@g.us", name: "Operators" })
      if (init?.method === "GET")
        return Response.json([{ id: "120363@g.us", name: "Operators", participants: [] }])
      return Response.json({ success: true })
    }
    const waha = createWahaClient({
      baseUrl: "https://waha.example.test",
      apiKey: "server-secret",
      fetch: fetcher,
    })

    // When group operations are invoked
    const created = await waha.createGroup("personal", "Operators", ["628123456789@c.us"])
    const listed = await waha.groups("personal")
    await waha.addGroupParticipants("personal", created.id, ["628987654321@c.us"])
    await waha.removeGroupParticipants("personal", created.id, ["628987654321@c.us"])

    // Then they use typed payloads and canonical WAHA paths
    expect(created).toEqual({ id: "120363@g.us", name: "Operators" })
    expect(listed).toEqual([{ id: "120363@g.us", name: "Operators", participants: [] }])
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /api/personal/groups",
      "GET /api/personal/groups",
      "POST /api/personal/groups/120363%40g.us/participants/add",
      "POST /api/personal/groups/120363%40g.us/participants/remove",
    ])
    expect(requests.map(({ body }) => body)).toEqual([
      JSON.stringify({ name: "Operators", participants: ["628123456789@c.us"] }),
      undefined,
      JSON.stringify({ participants: ["628987654321@c.us"] }),
      JSON.stringify({ participants: ["628987654321@c.us"] }),
    ])
  })

  it("rejects a blank group name before making a WAHA request", async () => {
    // Given a valid server-side client
    const waha = createWahaClient({
      baseUrl: "https://waha.example.test",
      apiKey: "server-secret",
      fetch: async () => Response.json({ id: "120363@g.us", name: "Operators" }),
    })

    // When a malformed group name is submitted
    // Then boundary validation rejects it
    expect(() => waha.createGroup("personal", "   ", [])).toThrow()
  })

  it("surfaces WAHA 403 when the server key lacks the send scope", async () => {
    // Given a WAHA key without permission to mutate groups
    const waha = createWahaClient({
      baseUrl: "https://waha.example.test",
      apiKey: "read-only-server-secret",
      fetch: async () => Response.json({ error: "insufficient scope" }, { status: 403 }),
    })

    // When a group mutation is attempted
    const operation = waha.addGroupParticipants("personal", "120363@g.us", ["628123456789@c.us"])

    // Then the authorization failure remains visible to the scoped API caller
    await expect(operation).rejects.toMatchObject({ status: 403 })
    await expect(operation).rejects.toBeInstanceOf(WahaHttpError)
  })
})
