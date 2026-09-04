import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { type ReactionEvent, reactionEventSchema } from "../campaigns/reaction-trigger"
import type { AccountScope } from "../db/schema/shared"

const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000
const wahaEngines = ["WEBJS", "WPP", "GOWS", "NOWEB"] as const
const ackNames = ["ERROR", "PENDING", "SERVER", "DEVICE", "READ", "PLAYED"] as const
const webhookEvents = [
  "session.status",
  "message",
  "message.any",
  "message.ack",
  "message.waiting",
  "message.edited",
  "message.revoked",
  "message.reaction",
  "chat.archive",
  "group.v2.join",
  "group.v2.leave",
  "group.v2.participants",
  "group.v2.update",
  "presence.update",
  "poll.vote",
  "poll.vote.failed",
  "event.response",
  "event.response.failed",
  "label.upsert",
  "label.deleted",
  "label.chat.added",
  "label.chat.deleted",
  "call.received",
  "call.accepted",
  "call.rejected",
  "engine.event",
] as const

type WahaEvent = z.infer<typeof wahaEventSchema>
type WebhookHeaders = Readonly<Record<string, string | string[] | undefined>>
export type SignedWebhookRequest = {
  readonly rawBody: string | Buffer
  readonly headers: WebhookHeaders
}
export type PayloadEnvelope = {
  readonly payloadCiphertext: string
  readonly payloadNonce: string
  readonly payloadAuthTag: string
}

type WebhookEventInput = {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly eventType: string
  readonly providerEventId: string
  readonly requestId: string
  readonly payload: PayloadEnvelope
  readonly occurredAt: Date
}

type DispatchStateUpdate = {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly providerMessageId: string
  readonly state: "attempting" | "submitted" | "acknowledged" | "failed"
}

export type WahaWebhookStore = {
  readonly findSession: (
    accountScope: AccountScope,
    sessionName: string,
  ) => Promise<{
    readonly id: string
    readonly accountScope: AccountScope
    readonly status: string
  } | null>
  readonly insertEvent: (input: WebhookEventInput) => Promise<"inserted" | "duplicate">
  readonly insertEventAndUpdateDispatchState?: (
    input: WebhookEventInput,
    dispatch: DispatchStateUpdate,
  ) => Promise<"inserted" | "duplicate">
  readonly updateSessionStatus: (
    sessionId: string,
    accountScope: AccountScope,
    status: string,
    occurredAt: Date,
  ) => Promise<void>
  readonly updateDispatchState: (
    sessionId: string,
    accountScope: AccountScope,
    providerMessageId: string,
    state: "attempting" | "submitted" | "acknowledged" | "failed",
  ) => Promise<void>
}

const wahaEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  event: z.string().min(1),
  session: z.string().min(1),
  engine: z.enum(wahaEngines).optional(),
  payload: z.unknown(),
})

const ackPayloadSchema = z
  .object({
    id: z.string().min(1),
    ack: z.number().int().min(-1).max(4),
    ackName: z.enum(ackNames),
  })
  .passthrough()
  .superRefine((payload, context) => {
    if (payload.ackName !== ackNames[payload.ack + 1]) {
      context.addIssue({ code: "custom", message: "ackName does not match ack" })
    }
  })
const sessionStatusPayloadSchema = z.object({ status: z.string().min(1) }).passthrough()
const messageWaitingPayloadSchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number().optional(),
    from: z.string().optional(),
    fromMe: z.boolean().optional(),
    to: z.string().optional(),
    _data: z.record(z.unknown()).optional(),
  })
  .passthrough()

function supportsEventPayload(event: WahaEvent): boolean {
  if (event.event === "message.waiting") {
    return event.engine === "WEBJS" && messageWaitingPayloadSchema.safeParse(event.payload).success
  }
  if (event.event === "message.ack") return ackPayloadSchema.safeParse(event.payload).success
  return true
}

export type WahaWebhookHandlerOptions = {
  readonly secret: string
  readonly store: WahaWebhookStore
  readonly now?: () => Date
  readonly replayWindowMs?: number
  readonly configuredEvents?: readonly string[]
  readonly encodePayload?: (rawBody: Buffer, accountScope: AccountScope) => PayloadEnvelope
  readonly onReaction?: (event: ReactionEvent) => Promise<void>
}

export type WahaWebhookResult =
  | { readonly status: 202; readonly duplicate: false }
  | { readonly status: 200; readonly duplicate: true }
  | { readonly status: 400 | 401 | 503; readonly duplicate: false }

function header(headers: WebhookHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()] ?? headers[name]
  return Array.isArray(value) ? value[0] : value
}

function validHmac(rawBody: string | Buffer, secret: string, supplied: string): boolean {
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex")
  const actual = Buffer.from(supplied, "utf8")
  const expectedBytes = Buffer.from(expected, "utf8")
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes)
}

function defaultPayloadEnvelope(rawBody: string | Buffer): PayloadEnvelope {
  const digest = createHmac("sha256", "waha-event-redaction").update(rawBody).digest("hex")
  return { payloadCiphertext: digest, payloadNonce: "redacted", payloadAuthTag: "redacted" }
}

function ackState(ack: number): {
  readonly rank: number
  readonly state: "attempting" | "submitted" | "acknowledged" | "failed"
} {
  if (ack < 0) return { rank: 5, state: "failed" }
  if (ack === 0) return { rank: 1, state: "attempting" }
  if (ack === 1) return { rank: 2, state: "submitted" }
  return { rank: ack + 2, state: "acknowledged" }
}

export function createWahaWebhookHandler(options: WahaWebhookHandlerOptions) {
  const now = options.now ?? (() => new Date())
  const replayWindowMs = options.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS
  const configuredEvents = new Set(options.configuredEvents ?? webhookEvents)
  const highestAck = new Map<string, number>()
  const latestSessionEvent = new Map<string, number>()
  const dispatchUpdates = new Map<string, Promise<void>>()

  async function applyAck(sessionId: string, accountScope: AccountScope, payload: unknown) {
    const ack = ackPayloadSchema.safeParse(payload)
    if (!ack.success) return
    const next = ackState(ack.data.ack)
    const key = `${sessionId}:${ack.data.id}`
    const previousUpdate = dispatchUpdates.get(key) ?? Promise.resolve()
    const currentUpdate = previousUpdate.then(async () => {
      if (next.rank <= (highestAck.get(key) ?? -1)) return
      await options.store.updateDispatchState(sessionId, accountScope, ack.data.id, next.state)
      highestAck.set(key, next.rank)
    })
    dispatchUpdates.set(key, currentUpdate)
    try {
      await currentUpdate
    } finally {
      if (dispatchUpdates.get(key) === currentUpdate) dispatchUpdates.delete(key)
    }
  }

  return async function ingest(
    request: SignedWebhookRequest,
    accountScope: AccountScope,
    sessionName: string,
  ): Promise<WahaWebhookResult> {
    const rawBodyText = request.rawBody.toString()
    const requestId = header(request.headers, "x-webhook-request-id")
    const timestampHeader = header(request.headers, "x-webhook-timestamp")
    const algorithm = header(request.headers, "x-webhook-hmac-algorithm")
    const suppliedHmac = header(request.headers, "x-webhook-hmac")
    const timestamp = timestampHeader === undefined ? Number.NaN : Number(timestampHeader)
    const age = Math.abs(now().getTime() - timestamp)
    if (
      !requestId ||
      !timestampHeader ||
      !Number.isInteger(timestamp) ||
      age > replayWindowMs ||
      algorithm !== "sha512" ||
      !suppliedHmac ||
      !validHmac(request.rawBody, options.secret, suppliedHmac)
    ) {
      return { status: 401, duplicate: false }
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBodyText)
    } catch (error) {
      if (error instanceof SyntaxError) return { status: 400, duplicate: false }
      throw error
    }
    const parsed = wahaEventSchema.safeParse(parsedJson)
    if (
      !parsed.success ||
      parsed.data.session !== sessionName ||
      !configuredEvents.has(parsed.data.event) ||
      !supportsEventPayload(parsed.data)
    ) {
      return { status: 400, duplicate: false }
    }
    const event: WahaEvent = parsed.data
    let session: Awaited<ReturnType<WahaWebhookStore["findSession"]>>
    try {
      session = await options.store.findSession(accountScope, sessionName)
    } catch (error) {
      if (error instanceof Error) return { status: 503, duplicate: false }
      throw error
    }
    if (!session || session.accountScope !== accountScope) return { status: 400, duplicate: false }

    let payload: PayloadEnvelope
    try {
      payload =
        options.encodePayload?.(
          Buffer.isBuffer(request.rawBody) ? request.rawBody : Buffer.from(request.rawBody),
          accountScope,
        ) ?? defaultPayloadEnvelope(request.rawBody)
    } catch (error) {
      if (error instanceof Error) return { status: 503, duplicate: false }
      throw error
    }
    const eventInput: WebhookEventInput = {
      sessionId: session.id,
      accountScope,
      eventType: event.event,
      providerEventId: event.id,
      requestId,
      payload,
      occurredAt: new Date(event.timestamp),
    }
    let inserted: "inserted" | "duplicate"
    try {
      const ack = ackPayloadSchema.safeParse(event.payload)
      const atomicInsert = options.store.insertEventAndUpdateDispatchState
      if (event.event === "message.ack" && ack.success && atomicInsert) {
        const next = ackState(ack.data.ack)
        const key = `${session.id}:${ack.data.id}`
        const previousUpdate = dispatchUpdates.get(key) ?? Promise.resolve()
        let atomicInserted: "inserted" | "duplicate" = "duplicate"
        const currentUpdate = previousUpdate.then(async () => {
          atomicInserted = await atomicInsert(eventInput, {
            sessionId: session.id,
            accountScope,
            providerMessageId: ack.data.id,
            state: next.state,
          })
          highestAck.set(key, Math.max(highestAck.get(key) ?? -1, next.rank))
        })
        dispatchUpdates.set(key, currentUpdate)
        try {
          await currentUpdate
          inserted = atomicInserted
        } finally {
          if (dispatchUpdates.get(key) === currentUpdate) dispatchUpdates.delete(key)
        }
      } else {
        inserted = await options.store.insertEvent(eventInput)
      }
    } catch (error) {
      if (error instanceof Error) return { status: 503, duplicate: false }
      throw error
    }
    if (event.event === "message.ack" && !options.store.insertEventAndUpdateDispatchState) {
      try {
        await applyAck(session.id, accountScope, event.payload)
      } catch (error) {
        if (error instanceof Error) return { status: 503, duplicate: false }
        throw error
      }
    }
    if (event.event === "session.status") {
      const status = sessionStatusPayloadSchema.safeParse(event.payload)
      const previousTimestamp = latestSessionEvent.get(session.id) ?? -1
      if (status.success && event.timestamp >= previousTimestamp) {
        try {
          await options.store.updateSessionStatus(
            session.id,
            accountScope,
            status.data.status,
            new Date(event.timestamp),
          )
        } catch (error) {
          if (error instanceof Error) return { status: 503, duplicate: false }
          throw error
        }
        latestSessionEvent.set(session.id, event.timestamp)
      }
    }
    if (inserted === "duplicate") return { status: 200, duplicate: true }
    if (event.event === "message.reaction" && options.onReaction) {
      const reaction = reactionEventSchema.safeParse({
        sessionId: session.id,
        accountScope,
        reactionMessageId:
          typeof event.payload === "object" && event.payload !== null && "id" in event.payload
            ? event.payload.id
            : undefined,
        participant:
          typeof event.payload === "object" &&
          event.payload !== null &&
          "participant" in event.payload
            ? event.payload.participant
            : undefined,
        sourceMessageId:
          typeof event.payload === "object" &&
          event.payload !== null &&
          "messageId" in event.payload
            ? event.payload.messageId
            : undefined,
        wahaGroupId:
          typeof event.payload === "object" && event.payload !== null && "chatId" in event.payload
            ? event.payload.chatId
            : undefined,
      })
      if (reaction.success) await options.onReaction(reaction.data)
    }
    return { status: 202, duplicate: false }
  }
}
