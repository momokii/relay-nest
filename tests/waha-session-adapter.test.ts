import { describe, expect, it } from "vitest"

import { createWahaClient } from "../apps/api/src/waha/adapter"

describe("WAHA session adapter contract", () => {
  it("uses canonical lifecycle, QR, pairing, passkey, metadata, timelock, and capping paths", async () => {
    // Given a fetch seam that records exact requests and returns typed WAHA-shaped data
    const records: { method: string; path: string; key: string | undefined }[] = []
    const fetcher = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(input)
      records.push({
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        key: new Headers(init?.headers).get("X-Api-Key") ?? undefined,
      })
      if (url.pathname.endsWith("/auth/qr"))
        return Response.json({ mimetype: "image/png", data: "qr-image-bytes" })
      if (url.pathname.endsWith("/me"))
        return Response.json({ id: "phone-id", pushname: "Safe name" })
      if (url.pathname.endsWith("/timelock")) return Response.json({ locked: true })
      if (url.pathname.endsWith("/capping")) return Response.json({ remaining: 4 })
      if (url.pathname.endsWith("/challenge")) return Response.json({ challenge: "challenge" })
      if (url.pathname.endsWith("/confirmation")) return Response.json({ code: "123456" })
      if (url.pathname === "/api/sessions") return Response.json([])
      if (
        init?.method === "DELETE" ||
        url.pathname.endsWith("/auth/request-code") ||
        url.pathname.endsWith("/auth/passkey") ||
        url.pathname.endsWith("/auth/passkey/confirm")
      )
        return new Response(null, { status: 204 })
      return Response.json({
        name: "personal",
        status: "STARTING",
        presence: {},
        timestamps: { activity: null },
      })
    }
    const waha = createWahaClient({
      baseUrl: "https://waha.example.test",
      apiKey: "server-secret",
      fetch: fetcher,
    })

    // When all native dashboard session operations are invoked
    await waha.session("personal")
    await waha.start("personal")
    await waha.stop("personal")
    await waha.restart("personal")
    await waha.logout("personal")
    await waha.remove("personal")
    const qr = await waha.qr("personal", "image")
    await waha.requestPairingCode("personal", "+628123456789")
    await waha.passkeyChallenge("personal")
    await waha.passkeyAssertion("personal", { assertion: "opaque" })
    await waha.passkeyConfirmation("personal")
    await waha.confirmPasskey("personal")
    await waha.me("personal")
    await waha.timelock("personal")
    await waha.capping("personal")

    // Then the exact pinned paths and server-only credential are used
    expect(records.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/sessions/personal",
      "POST /api/sessions/personal/start",
      "POST /api/sessions/personal/stop",
      "POST /api/sessions/personal/restart",
      "POST /api/sessions/personal/logout",
      "DELETE /api/sessions/personal",
      "GET /api/personal/auth/qr?format=image",
      "POST /api/personal/auth/request-code",
      "GET /api/personal/auth/passkey/challenge",
      "POST /api/personal/auth/passkey",
      "GET /api/personal/auth/passkey/confirmation",
      "POST /api/personal/auth/passkey/confirm",
      "GET /api/sessions/personal/me",
      "GET /api/sessions/personal/timelock",
      "GET /api/sessions/personal/capping",
    ])
    expect(records.every(({ key }) => key === "server-secret")).toBe(true)
    expect(qr).toEqual({ value: "data:image/png;base64,qr-image-bytes" })
  })
})
