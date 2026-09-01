import { readFileSync } from "node:fs"
import { Readable } from "node:stream"
import { createEnvelopeCipher } from "@waha-command-center/config"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"

import type { AccountScope } from "../db/schema/shared"
import { createWahaWebhookHandler, type WahaWebhookStore } from "./webhook"

const rawBodies = new WeakMap<FastifyRequest, Buffer>()
const MAX_WAHA_WEBHOOK_BODY_BYTES = 1_048_576

export function resolveWebhookSecret(environment: NodeJS.ProcessEnv): string | undefined {
  const plain = environment["WAHA_WEBHOOK_SECRET"]
  if (plain) return plain
  const secretFile = environment["WAHA_WEBHOOK_SECRET_FILE"]
  if (!secretFile) return undefined
  const secret = readFileSync(secretFile, "utf8").trim()
  if (secret.length === 0) throw new Error("WAHA webhook secret file is empty")
  return secret
}

class WahaWebhookBodyTooLargeError extends Error {
  readonly code = "WAHA_WEBHOOK_BODY_TOO_LARGE"
  readonly statusCode = 413

  constructor() {
    super("webhook body too large")
  }
}

export function isMalformedWahaWebhookBodyError(error: unknown, requestUrl: string): boolean {
  if (!requestUrl.startsWith("/api/webhooks/waha/")) return false
  if (!(error instanceof Error) || !("code" in error)) return false
  return error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
}

export function isOversizedWahaWebhookBodyError(error: unknown, requestUrl: string): boolean {
  return (
    requestUrl.startsWith("/api/webhooks/waha/") && error instanceof WahaWebhookBodyTooLargeError
  )
}

async function captureRawBody(
  request: FastifyRequest,
  _reply: unknown,
  payload: AsyncIterable<Buffer | string | Uint8Array>,
): Promise<Readable> {
  const contentLength = Number(request.headers["content-length"])
  if (Number.isInteger(contentLength) && contentLength > MAX_WAHA_WEBHOOK_BODY_BYTES) {
    throw new WahaWebhookBodyTooLargeError()
  }
  const chunks: Buffer[] = []
  let byteLength = 0
  for await (const chunk of payload) {
    const buffer =
      typeof chunk === "string"
        ? Buffer.from(chunk, "utf8")
        : Buffer.isBuffer(chunk)
          ? chunk
          : chunk instanceof Uint8Array
            ? Buffer.from(chunk)
            : undefined
    if (!buffer) throw new TypeError("unsupported webhook body chunk")
    byteLength += buffer.byteLength
    if (byteLength > MAX_WAHA_WEBHOOK_BODY_BYTES) throw new WahaWebhookBodyTooLargeError()
    chunks.push(buffer)
  }
  const rawBody = Buffer.concat(chunks)
  rawBodies.set(request, rawBody)
  return Readable.from([rawBody])
}

export function registerWahaWebhookRoutes(
  app: FastifyInstance,
  options: {
    readonly secret: string | undefined
    readonly encryptionMasterKey: Buffer | undefined
    readonly store: WahaWebhookStore
  },
): void {
  app.addHook("preParsing", async (request, reply, payload) => {
    if (!request.url.startsWith("/api/webhooks/waha/")) return payload
    return captureRawBody(request, reply, payload)
  })
  const cipher = options.encryptionMasterKey
    ? createEnvelopeCipher(options.encryptionMasterKey)
    : undefined
  const handler = options.secret
    ? createWahaWebhookHandler({
        secret: options.secret,
        store: options.store,
        ...(cipher
          ? {
              encodePayload: (body: Buffer, accountScope: AccountScope) => {
                const envelope = cipher.encrypt(body.toString("utf8"), { accountScope })
                return {
                  payloadCiphertext: envelope.ciphertext,
                  payloadNonce: envelope.nonce,
                  payloadAuthTag: envelope.authTag,
                }
              },
            }
          : {}),
      })
    : undefined
  app.post<{ Params: { readonly accountScope: AccountScope; readonly sessionName: string } }>(
    "/api/webhooks/waha/:accountScope/:sessionName",
    async (request, reply) => {
      const scope = z.enum(["personal", "business"]).safeParse(request.params.accountScope)
      if (!scope.success || !handler) return reply.code(503).send({ error: "webhook unavailable" })
      const rawBody = rawBodies.get(request)
      if (!rawBody) return reply.code(400).send({ error: "invalid webhook body" })
      const result = await handler(
        { rawBody, headers: request.headers },
        scope.data,
        request.params.sessionName,
      )
      const responseBody = result.duplicate
        ? { duplicate: true }
        : result.status === 202
          ? { accepted: true }
          : { error: "webhook rejected" }
      return reply.code(result.status).send(responseBody)
    },
  )
}
