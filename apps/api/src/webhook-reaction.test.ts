import { createHmac } from "node:crypto"

import { createEnvelopeCipher } from "@waha-command-center/config"
import { afterEach, describe, expect, it } from "vitest"
import Fastify from "../node_modules/fastify"

import type { WahaWebhookStore } from "./waha/webhook"
import { registerWahaWebhookRoutes } from "./waha/webhook-http"

const secret = "g4-reaction-webhook-secret"
const masterKey = Buffer.alloc(32, 7)
const now = new Date("2026-09-04T12:00:00.000Z")

type StoredEvent = Parameters<WahaWebhookStore["insertEvent"]>[0]

function createStore(): WahaWebhookStore & { readonly events: StoredEvent[] } {
  const events: StoredEvent[] = []
  return {
    events,
    findSession: async (accountScope, sessionName) =>
      sessionName === "personal-session"
        ? { id: "session-g4", accountScope, status: "WORKING" }
        : null,
    insertEvent: async (input) => {
      if (
        events.some(
          (event) =>
            event.providerEventId === input.providerEventId || event.requestId === input.requestId,
        )
      ) {
        return "duplicate"
      }
      events.push(input)
      return "inserted"
    },
    updateSessionStatus: async () => undefined,
    updateDispatchState: async () => undefined,
  }
}

function reactionBody(id = "reaction-event-1"): string {
  return JSON.stringify({
    id,
    timestamp: now.getTime(),
    event: "message.reaction",
    session: "personal-session",
    payload: {
      id: "reaction-message-1",
      reaction: "👍",
      participant: "628123456789@c.us",
      messageId: "group-message-1",
    },
  })
}

function headers(body: string, requestId: string, timestamp = Date.now()) {
  return {
    "content-type": "application/json",
    "x-webhook-request-id": requestId,
    "x-webhook-timestamp": String(timestamp),
    "x-webhook-hmac-algorithm": "sha512",
    "x-webhook-hmac": createHmac("sha512", secret).update(body).digest("hex"),
  }
}

describe("G4 message.reaction webhook ingestion", () => {
  let app: ReturnType<typeof Fastify> | undefined

  afterEach(async () => {
    if (app) await app.close()
  })

  it("stores a valid reaction encrypted and makes duplicate provider events idempotent", async () => {
    // Given a webhook route with the server-side signing and encryption keys
    const store = createStore()
    const reactions: unknown[] = []
    app = Fastify()
    registerWahaWebhookRoutes(app, {
      secret,
      encryptionMasterKey: masterKey,
      store,
      onReaction: async (reaction) => {
        reactions.push(reaction)
      },
    })
    const body = reactionBody()

    // When the same valid reaction is submitted twice
    const first = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(body, "reaction-request-1"),
      payload: body,
    })
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(body, "reaction-request-2"),
      payload: body,
    })

    // Then one encrypted normalized event is durable and the retry is idempotent
    expect(first.statusCode).toBe(202)
    expect(duplicate.statusCode).toBe(200)
    expect(duplicate.json()).toEqual({ duplicate: true })
    expect(store.events).toHaveLength(1)
    expect(reactions).toHaveLength(1)
    const event = store.events[0]
    expect(event?.eventType).toBe("message.reaction")
    expect(event?.providerEventId).toBe("reaction-event-1")
    expect(event?.payload.payloadCiphertext).not.toContain("628123456789")
    expect(
      createEnvelopeCipher(masterKey).decrypt(
        {
          version: 1,
          algorithm: "aes-256-gcm",
          ciphertext: event?.payload.payloadCiphertext ?? "",
          nonce: event?.payload.payloadNonce ?? "",
          authTag: event?.payload.payloadAuthTag ?? "",
        },
        { accountScope: "personal" },
      ),
    ).toBe(body)
  })

  it("rejects bad HMACs and reactions outside the five-minute replay window", async () => {
    // Given a webhook route and a reaction with invalid authentication variants
    const store = createStore()
    app = Fastify()
    registerWahaWebhookRoutes(app, { secret, encryptionMasterKey: masterKey, store })
    const body = reactionBody("reaction-event-2")

    // When bad-signature and stale-timestamp requests are submitted
    const badHmac = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: { ...headers(body, "reaction-request-bad"), "x-webhook-hmac": "bad" },
      payload: body,
    })
    const replayed = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(body, "reaction-request-stale", Date.now() - 301_000),
      payload: body,
    })

    // Then neither unauthenticated request reaches normalized_events
    expect(badHmac.statusCode).toBe(401)
    expect(replayed.statusCode).toBe(401)
    expect(store.events).toHaveLength(0)
  })

  it("does not accept a client-supplied scope outside the server allowlist", async () => {
    // Given a validly signed reaction sent to an invalid scope path
    const store = createStore()
    app = Fastify()
    registerWahaWebhookRoutes(app, { secret, encryptionMasterKey: masterKey, store })
    const body = reactionBody("reaction-event-3")

    // When the client supplies an unsupported scope segment
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/forged/personal-session",
      headers: headers(body, "reaction-request-forged-scope"),
      payload: body,
    })

    // Then the request is unavailable and no event is stored
    expect(response.statusCode).toBe(503)
    expect(store.events).toHaveLength(0)
  })
})
