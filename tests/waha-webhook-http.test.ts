import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"
import type { WahaWebhookStore } from "../apps/api/src/waha/webhook"
import {
  isMalformedWahaWebhookBodyError,
  registerWahaWebhookRoutes,
} from "../apps/api/src/waha/webhook-http"

const secret = "http-webhook-secret"
const timestamp = String(Date.now())
const event = JSON.stringify(
  {
    id: "evt-http-1",
    timestamp: Number(timestamp),
    event: "message",
    session: "personal-session",
    payload: { id: "message-http-1", body: "untrusted event text" },
  },
  null,
  2,
)

function createStore(): WahaWebhookStore & { readonly eventIds: string[] } {
  const eventIds: string[] = []
  return {
    eventIds,
    findSession: async (accountScope, sessionName) =>
      sessionName === "personal-session"
        ? { id: "session-http", accountScope, status: "STARTING" }
        : null,
    insertEvent: async (input) => {
      if (eventIds.includes(input.providerEventId)) return "duplicate"
      eventIds.push(input.providerEventId)
      expect(JSON.stringify(input.payload)).not.toContain("untrusted event text")
      return "inserted"
    },
    updateSessionStatus: async () => undefined,
    updateDispatchState: async () => undefined,
  }
}

function headers(body: string, requestId = "request-http-1") {
  return {
    "content-type": "application/json",
    "x-webhook-request-id": requestId,
    "x-webhook-timestamp": timestamp,
    "x-webhook-hmac-algorithm": "sha512",
    "x-webhook-hmac": createHmac("sha512", secret).update(body).digest("hex"),
  }
}

describe("WAHA webhook HTTP endpoint", () => {
  let app: ReturnType<typeof Fastify> | undefined

  afterEach(async () => {
    if (app) await app.close()
  })

  it("accepts a valid raw-body signature once and returns a duplicate response", async () => {
    // Given a Fastify endpoint with a scoped session store
    app = Fastify()
    registerWahaWebhookRoutes(app, {
      secret,
      encryptionMasterKey: undefined,
      store: createStore(),
    })

    // When the exact signed body is submitted twice
    const first = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(event),
      payload: event,
    })
    const second = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(event),
      payload: event,
    })

    // Then the first request is accepted and the retry is acknowledged without reinsertion
    expect(first.statusCode).toBe(202)
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({ duplicate: true })
  })

  it("rejects a signature computed over normalized JSON instead of the raw body", async () => {
    // Given a body whose whitespace is part of the signed bytes
    app = Fastify()
    registerWahaWebhookRoutes(app, {
      secret,
      encryptionMasterKey: undefined,
      store: createStore(),
    })
    const normalized = JSON.stringify(JSON.parse(event))

    // When the sender signs normalized bytes but transmits the original body
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(normalized, "request-http-bad"),
      payload: event,
    })

    // Then the raw-body authentication fails
    expect(response.statusCode).toBe(401)
  })

  it("redacts Fastify parser details for malformed JSON with a valid webhook signature", async () => {
    // Given malformed JSON signed over its exact raw bytes
    app = Fastify()
    registerWahaWebhookRoutes(app, {
      secret,
      encryptionMasterKey: undefined,
      store: createStore(),
    })
    app.setErrorHandler((error, request, reply) => {
      if (isMalformedWahaWebhookBodyError(error, request.url)) {
        return reply.code(400).send({ error: "invalid webhook body" })
      }
      return reply.code(500).send({ error: "internal error" })
    })
    const malformed = "{not-json"

    // When the malformed body is sent with valid timestamp, request ID, and HMAC headers
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(malformed, "request-http-malformed"),
      payload: malformed,
    })

    // Then the response is a generic 400 without parser or body details
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: "invalid webhook body" })
    expect(response.body).not.toContain("FST_ERR_CTP_INVALID_JSON_BODY")
    expect(response.body).not.toContain(malformed)
  })

  it("does not let a concurrent older ACK downgrade the shared HTTP consumer", async () => {
    // Given a route consumer shared across concurrent HTTP requests
    let persistedState = ""
    let releaseLowUpdate = (): void => undefined
    let enterLowUpdate: () => void = () => undefined
    let enterHighRequest: () => void = () => undefined
    const lowUpdateEntered = new Promise<void>((resolve) => {
      enterLowUpdate = resolve
    })
    const highRequestEntered = new Promise<void>((resolve) => {
      enterHighRequest = resolve
    })
    const store: WahaWebhookStore = {
      findSession: async (accountScope, sessionName) =>
        sessionName === "personal-session"
          ? { id: "session-http", accountScope, status: "STARTING" }
          : null,
      insertEvent: async (input) => {
        if (input.providerEventId === "evt-ack-high") enterHighRequest()
        return "inserted"
      },
      updateSessionStatus: async () => undefined,
      updateDispatchState: async (_sessionId, _scope, _messageId, state) => {
        if (state === "attempting") {
          enterLowUpdate()
          await new Promise<void>((resolve) => {
            releaseLowUpdate = resolve
          })
        }
        persistedState = state
      },
    }
    app = Fastify()
    registerWahaWebhookRoutes(app, { secret, encryptionMasterKey: undefined, store })
    const lowBody = JSON.stringify({
      id: "evt-ack-low",
      timestamp: Number(timestamp),
      event: "message.ack",
      session: "personal-session",
      payload: { id: "message-concurrent", ack: 0, ackName: "PENDING" },
    })
    const highBody = JSON.stringify({
      id: "evt-ack-high",
      timestamp: Number(timestamp),
      event: "message.ack",
      session: "personal-session",
      payload: { id: "message-concurrent", ack: 3, ackName: "READ" },
    })

    // When the higher ACK completes before the older request is released
    const lowRequest = app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(lowBody, "request-ack-low"),
      payload: lowBody,
    })
    await lowUpdateEntered
    const highRequest = app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(highBody, "request-ack-high"),
      payload: highBody,
    })
    await highRequestEntered
    releaseLowUpdate()
    const highResponse = await highRequest
    const lowResponse = await lowRequest

    // Then the final persisted transition remains acknowledged
    expect(highResponse.statusCode).toBe(202)
    expect(lowResponse.statusCode).toBe(202)
    expect(persistedState).toBe("acknowledged")
  })

  it("accepts WEBJS message.waiting and rejects unsupported or malformed variants", async () => {
    // Given the official WEBJS-only waiting event contract
    app = Fastify()
    registerWahaWebhookRoutes(app, {
      secret,
      encryptionMasterKey: undefined,
      store: createStore(),
    })
    const waiting = JSON.stringify({
      id: "evt-waiting-valid",
      timestamp: Number(timestamp),
      event: "message.waiting",
      session: "personal-session",
      engine: "WEBJS",
      payload: {
        id: "message-waiting",
        timestamp: 1667561485,
        from: "11111111111@c.us",
        fromMe: true,
        to: "11111111111@c.us",
        _data: { engine: "WEBJS" },
      },
    })
    const unsupported = JSON.stringify({
      id: "evt-waiting-unsupported",
      timestamp: Number(timestamp),
      event: "message.waiting",
      session: "personal-session",
      engine: "GOWS",
      payload: { id: "message-waiting" },
    })
    const malformed = JSON.stringify({
      id: "evt-waiting-malformed",
      timestamp: Number(timestamp),
      event: "message.waiting",
      session: "personal-session",
      engine: "WEBJS",
      payload: "not-an-event-object",
    })
    const extraField = JSON.stringify({
      id: "evt-waiting-extra",
      timestamp: Number(timestamp),
      event: "message.waiting",
      session: "personal-session",
      engine: "WEBJS",
      payload: { id: "message-waiting", body: "untrusted waiting text" },
    })

    // When valid and invalid engine-specific events are submitted with exact HMACs
    const accepted = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(waiting, "request-waiting-valid"),
      payload: waiting,
    })
    const unsupportedResponse = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(unsupported, "request-waiting-unsupported"),
      payload: unsupported,
    })
    const malformedResponse = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(malformed, "request-waiting-malformed"),
      payload: malformed,
    })
    const extraFieldResponse = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(extraField, "request-waiting-extra"),
      payload: extraField,
    })

    // Then only WEBJS is accepted and hostile/malformed data is not reflected
    expect(accepted.statusCode).toBe(202)
    expect(unsupportedResponse.statusCode).toBe(400)
    expect(malformedResponse.statusCode).toBe(400)
    expect(extraFieldResponse.statusCode).toBe(202)
    expect(malformedResponse.body).not.toContain("not-an-event-object")
    expect(extraFieldResponse.body).not.toContain("untrusted waiting text")
  })

  it("rejects oversized webhook bodies before buffering them", async () => {
    // Given a body larger than the webhook capture limit
    app = Fastify()
    registerWahaWebhookRoutes(app, {
      secret,
      encryptionMasterKey: undefined,
      store: createStore(),
    })
    const oversized = JSON.stringify({
      id: "evt-oversized",
      timestamp: Number(timestamp),
      event: "message",
      session: "personal-session",
      payload: { body: "x".repeat(1_048_577) },
    })

    // When the oversized request is submitted
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/waha/personal/personal-session",
      headers: headers(oversized, "request-oversized"),
      payload: oversized,
    })

    // Then buffering is stopped with a bounded generic response
    expect(response.statusCode).toBe(413)
    expect(response.body).not.toContain("x".repeat(100))
  })
})
