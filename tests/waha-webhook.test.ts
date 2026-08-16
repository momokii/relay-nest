import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { createWahaWebhookHandler, type WahaWebhookStore } from "../apps/api/src/waha/webhook"

const secret = "webhook-test-secret"
const now = new Date("2026-08-16T12:00:00.000Z")

type StoredEvent = Parameters<WahaWebhookStore["insertEvent"]>[0]

function createStore(): WahaWebhookStore & {
  readonly events: StoredEvent[]
  readonly sessionUpdates: string[]
  readonly dispatchUpdates: string[]
} {
  const events: StoredEvent[] = []
  const sessionUpdates: string[] = []
  const dispatchUpdates: string[] = []
  return {
    events,
    sessionUpdates,
    dispatchUpdates,
    async findSession(scope, sessionName) {
      return sessionName === "personal-session"
        ? { id: "session-1", accountScope: scope, status: "STARTING" }
        : null
    },
    async insertEvent(input) {
      if (events.some((event) => event.requestId === input.requestId)) return "duplicate"
      if (events.some((event) => event.providerEventId === input.providerEventId))
        return "duplicate"
      events.push(input)
      return "inserted"
    },
    async updateSessionStatus(_sessionId, _scope, status) {
      sessionUpdates.push(status)
    },
    async updateDispatchState(_sessionId, _scope, providerMessageId, state) {
      dispatchUpdates.push(`${providerMessageId}:${state}`)
    },
  }
}

function signedRequest(
  body: string,
  overrides: Partial<Record<"requestId" | "timestamp" | "algorithm" | "hmac", string>> = {},
) {
  const requestId = overrides.requestId ?? "req-1"
  const timestamp = overrides.timestamp ?? String(now.getTime())
  const algorithm = overrides.algorithm ?? "sha512"
  const hmac = overrides.hmac ?? createHmac("sha512", secret).update(body).digest("hex")
  return {
    rawBody: body,
    headers: {
      "x-webhook-request-id": requestId,
      "x-webhook-timestamp": timestamp,
      "x-webhook-hmac-algorithm": algorithm,
      "x-webhook-hmac": hmac,
    },
  }
}

function eventBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt-1",
    timestamp: now.getTime(),
    event: "message",
    session: "personal-session",
    payload: { id: "message-1", body: "ignore this attacker-controlled text" },
    ...overrides,
  })
}

describe("WAHA webhook ingestion", () => {
  it("accepts one valid signed event and stores normalized encrypted fields", async () => {
    // Given a valid WAHA message event and the configured HMAC secret
    const store = createStore()
    const handler = createWahaWebhookHandler({ secret, now: () => now, store })

    // When the signed raw body is ingested
    const result = await handler(signedRequest(eventBody()), "personal", "personal-session")

    // Then it is accepted once without retaining plaintext event content
    expect(result).toEqual({ status: 202, duplicate: false })
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({
      accountScope: "personal",
      sessionId: "session-1",
      eventType: "message",
      providerEventId: "evt-1",
      requestId: "req-1",
    })
    expect(JSON.stringify(store.events[0])).not.toContain("attacker-controlled")
  })

  it("rejects a bad signature, stale timestamp, and missing headers", async () => {
    // Given a valid body and three invalid authentication variants
    const handler = createWahaWebhookHandler({ secret, now: () => now, store: createStore() })
    const body = eventBody()

    // When each invalid request is ingested
    const badSignature = await handler(
      signedRequest(body, { hmac: "00" }),
      "personal",
      "personal-session",
    )
    const stale = await handler(
      signedRequest(body, { timestamp: String(now.getTime() - 301_000), requestId: "req-stale" }),
      "personal",
      "personal-session",
    )
    const missing = await handler({ rawBody: body, headers: {} }, "personal", "personal-session")

    // Then authentication fails without exposing event text
    expect(badSignature).toMatchObject({ status: 401 })
    expect(stale).toMatchObject({ status: 401 })
    expect(missing).toMatchObject({ status: 401 })
    expect(JSON.stringify(badSignature)).not.toContain("attacker-controlled")
  })

  it("verifies HMAC over an HTTP body represented as raw bytes", async () => {
    // Given a valid event body retained as bytes from the HTTP stream
    const store = createStore()
    const handler = createWahaWebhookHandler({ secret, now: () => now, store })
    const rawBody = Buffer.from(eventBody())
    const hmac = createHmac("sha512", secret).update(rawBody).digest("hex")

    // When the byte-preserving request is ingested
    const result = await handler(
      {
        rawBody,
        headers: {
          "x-webhook-request-id": "req-bytes",
          "x-webhook-timestamp": String(now.getTime()),
          "x-webhook-hmac-algorithm": "sha512",
          "x-webhook-hmac": hmac,
        },
      },
      "personal",
      "personal-session",
    )

    // Then the exact bytes authenticate and parse as one event
    expect(result).toEqual({ status: 202, duplicate: false })
  })

  it("rejects malformed payloads and replayed request or event identifiers", async () => {
    // Given one accepted event and malformed, request-replayed, and event-replayed bodies
    const store = createStore()
    const handler = createWahaWebhookHandler({ secret, now: () => now, store })
    const first = eventBody()

    // When the variants are submitted with valid signatures
    const accepted = await handler(signedRequest(first), "personal", "personal-session")
    const malformedBody = "{not-json"
    const malformed = await handler(
      signedRequest(malformedBody, { requestId: "req-malformed" }),
      "personal",
      "personal-session",
    )
    const duplicateRequest = await handler(signedRequest(first), "personal", "personal-session")
    const duplicateEvent = await handler(
      signedRequest(eventBody({ payload: { id: "message-2" } }), { requestId: "req-2" }),
      "personal",
      "personal-session",
    )

    // Then only the first normalized event is durable
    expect(accepted).toEqual({ status: 202, duplicate: false })
    expect(malformed).toMatchObject({ status: 400 })
    expect(duplicateRequest).toEqual({ status: 200, duplicate: true })
    expect(duplicateEvent).toEqual({ status: 200, duplicate: true })
    expect(store.events).toHaveLength(1)
  })

  it("updates session state and tolerates out-of-order acknowledgments", async () => {
    // Given a session status event followed by acknowledgments in reverse order
    const store = createStore()
    const handler = createWahaWebhookHandler({ secret, now: () => now, store })
    const status = eventBody({
      id: "evt-status",
      event: "session.status",
      payload: { status: "WORKING" },
    })
    const ackRead = eventBody({
      id: "evt-ack-read",
      event: "message.ack",
      payload: { id: "message-1", ack: 3, ackName: "READ" },
    })
    const ackPending = eventBody({
      id: "evt-ack-pending",
      event: "message.ack",
      payload: { id: "message-1", ack: 0, ackName: "PENDING" },
    })

    // When all events are accepted
    await handler(
      signedRequest(status, { requestId: "req-status" }),
      "personal",
      "personal-session",
    )
    await handler(signedRequest(ackRead, { requestId: "req-read" }), "personal", "personal-session")
    await handler(
      signedRequest(ackPending, { requestId: "req-pending" }),
      "personal",
      "personal-session",
    )

    // Then session state advances and the older acknowledgment cannot downgrade it
    expect(store.sessionUpdates).toEqual(["WORKING"])
    expect(store.dispatchUpdates).toEqual(["message-1:acknowledged"])
  })

  it("accepts the official ACK range and rejects invalid or mismatched ACK metadata", async () => {
    // Given official ACK values and malformed ACK variants
    const store = createStore()
    const handler = createWahaWebhookHandler({ secret, now: () => now, store })
    const names = ["ERROR", "PENDING", "SERVER", "DEVICE", "READ", "PLAYED"]

    // When each official value and two invalid variants are ingested
    const officialResults = await Promise.all(
      names.map((ackName, index) =>
        handler(
          signedRequest(
            eventBody({
              id: `evt-ack-${index}`,
              event: "message.ack",
              payload: { id: "message-acks", ack: index - 1, ackName },
            }),
            { requestId: `req-ack-${index}` },
          ),
          "personal",
          "personal-session",
        ),
      ),
    )
    const invalidRange = await handler(
      signedRequest(
        eventBody({
          id: "evt-ack-invalid",
          event: "message.ack",
          payload: { id: "message-acks", ack: 5 },
        }),
        { requestId: "req-ack-invalid" },
      ),
      "personal",
      "personal-session",
    )
    const mismatch = await handler(
      signedRequest(
        eventBody({
          id: "evt-ack-mismatch",
          event: "message.ack",
          payload: { id: "message-acks", ack: 1, ackName: "READ" },
        }),
        { requestId: "req-ack-mismatch" },
      ),
      "personal",
      "personal-session",
    )

    // Then official values pass and malformed metadata is rejected
    expect(officialResults.every((result) => result.status === 202)).toBe(true)
    expect(invalidRange).toEqual({ status: 400, duplicate: false })
    expect(mismatch).toEqual({ status: 400, duplicate: false })
  })

  it("retries ACK processing when the first state persistence fails", async () => {
    // Given an ACK whose first dispatch-state write fails after event insertion
    const store = createStore()
    let attempts = 0
    store.updateDispatchState = async (_sessionId, _scope, _messageId, state) => {
      attempts += 1
      if (attempts === 1) throw new Error("dispatch state unavailable")
      store.dispatchUpdates.push(state)
    }
    const handler = createWahaWebhookHandler({ secret, now: () => now, store })
    const body = eventBody({
      event: "message.ack",
      payload: { id: "message-1", ack: 3, ackName: "READ" },
    })

    // When the sender retries the same signed event
    const first = await handler(signedRequest(body), "personal", "personal-session")
    const retry = await handler(
      signedRequest(body, { requestId: "req-2" }),
      "personal",
      "personal-session",
    )

    // Then the failed side effect is retryable even though the event is a duplicate
    expect(first).toEqual({ status: 503, duplicate: false })
    expect(retry).toEqual({ status: 200, duplicate: true })
    expect(store.dispatchUpdates).toEqual(["acknowledged"])
  })

  it("returns a retryable error for storage failures without logging payload data", async () => {
    // Given a valid event and a persistence failure
    const store = createStore()
    store.insertEvent = async () => {
      throw new Error("database unavailable")
    }
    const handler = createWahaWebhookHandler({ secret, now: () => now, store })

    // When the event is ingested
    const result = await handler(signedRequest(eventBody()), "personal", "personal-session")

    // Then the sender can retry and the response contains no untrusted body data
    expect(result).toEqual({ status: 503, duplicate: false })
    expect(JSON.stringify(result)).not.toContain("attacker-controlled")
  })

  it("returns retryable errors when session lookup or status persistence fails", async () => {
    // Given valid signed session status events and failing persistence seams
    const lookupFailureStore = createStore()
    lookupFailureStore.findSession = async () => {
      throw new Error("database unavailable")
    }
    const statusFailureStore = createStore()
    statusFailureStore.updateSessionStatus = async () => {
      throw new Error("database unavailable")
    }

    // When the webhook handler processes each failing event
    const lookupResult = await createWahaWebhookHandler({
      secret,
      now: () => now,
      store: lookupFailureStore,
    })(signedRequest(eventBody()), "personal", "personal-session")
    const statusResult = await createWahaWebhookHandler({
      secret,
      now: () => now,
      store: statusFailureStore,
    })(
      signedRequest(eventBody({ event: "session.status", payload: { status: "WORKING" } })),
      "personal",
      "personal-session",
    )

    // Then both failures remain retryable and do not expose persistence details
    expect(lookupResult).toEqual({ status: 503, duplicate: false })
    expect(statusResult).toEqual({ status: 503, duplicate: false })
  })
})
