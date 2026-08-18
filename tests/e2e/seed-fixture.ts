import { writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { z } from "zod"

const scopes = ["personal", "business"] as const
export const seedMetadataPath = ".tmp/playwright/seed.json"
const e2eRecipientPhone = "+15551234567"
const e2eRecipientChatId = "e2e-schedule-recipient@c.us"

const sessionMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  wahaSessionName: z.string().min(1),
})

export const e2eSeedMetadataSchema = z.object({
  personal: sessionMetadataSchema,
  business: sessionMetadataSchema,
  recipientPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
})

export type E2ESeedMetadata = z.infer<typeof e2eSeedMetadataSchema>

type SeedInput = Readonly<{
  readonly databaseUrl: string
  readonly userId: string
}>

type WahaFixtureSession = Readonly<{
  readonly name: string
  readonly status: "WORKING"
}>

type WahaFixture = Readonly<{
  readonly port: number
  readonly stop: () => Promise<void>
}>

export async function seedE2EData(
  input: SeedInput,
): Promise<Readonly<{ metadata: E2ESeedMetadata; wahaPort: number }>> {
  const sessions = scopes.map((scope) => ({
    scope,
    name: `e2e-${scope}-session-${crypto.randomUUID()}`,
    wahaSessionName: `e2e-${scope}-waha-${crypto.randomUUID()}`,
  }))
  const wahaFixture = await startWahaFixture(
    sessions.map((session) => ({ name: session.wahaSessionName, status: "WORKING" })),
    e2eRecipientPhone,
  )

  try {
    const { createDatabase } = await import("../../apps/api/src/db/client")
    const { createRepositories } = await import("../../apps/api/src/db/repositories")
    const { RETENTION_CATEGORIES } = await import("../../apps/api/src/retention/contracts")
    const { createBlindIndex, createEnvelopeCipher } = await import(
      "../../packages/config/src/index.ts"
    )

    const database = createDatabase(input.databaseUrl)
    try {
      const repositories = createRepositories(database.db)
      const masterKey = Buffer.from(process.env.ENCRYPTION_MASTER_KEY ?? "", "base64")
      const cipher = createEnvelopeCipher(masterKey)
      const metadata: Partial<
        Record<(typeof scopes)[number], z.infer<typeof sessionMetadataSchema>>
      > = {}

      for (const session of sessions) {
        const connection = await repositories.wahaConnections.create({
          name: `e2e-${session.scope}-connection-${crypto.randomUUID()}`,
          baseUrl: `http://127.0.0.1:${wahaFixture.port}`,
          ...encryptedApiKey(cipher),
        })
        const stored = await repositories.sessions.create({
          connectionId: connection.id,
          accountScope: session.scope,
          name: session.name,
          wahaSessionName: session.wahaSessionName,
          status: "WORKING",
        })
        await repositories.sessionGrants.create({
          userId: input.userId,
          sessionId: stored.id,
          accountScope: session.scope,
        })
        const phone = cipher.encrypt(e2eRecipientPhone, { accountScope: session.scope })
        const chatId = cipher.encrypt(e2eRecipientChatId, { accountScope: session.scope })
        const displayName = cipher.encrypt("E2E schedule recipient", {
          accountScope: session.scope,
        })
        await repositories.contacts.create({
          sessionId: stored.id,
          accountScope: session.scope,
          phoneCiphertext: phone.ciphertext,
          phoneNonce: phone.nonce,
          phoneAuthTag: phone.authTag,
          phoneBlindIndex: createBlindIndex(masterKey, e2eRecipientPhone),
          providerChatIdCiphertext: chatId.ciphertext,
          providerChatIdNonce: chatId.nonce,
          providerChatIdAuthTag: chatId.authTag,
          displayNameCiphertext: displayName.ciphertext,
          displayNameNonce: displayName.nonce,
          displayNameAuthTag: displayName.authTag,
          consentGranted: true,
          optedOut: false,
          consentUpdatedAt: new Date(),
        })
        for (const category of RETENTION_CATEGORIES) {
          await repositories.retentionPolicies.upsert({
            accountScope: session.scope,
            category,
            retentionDays: 30,
          })
        }
        metadata[session.scope] = {
          id: stored.id,
          name: stored.name,
          wahaSessionName: stored.wahaSessionName,
        }
      }

      const parsedMetadata = e2eSeedMetadataSchema.parse({
        ...metadata,
        recipientPhone: e2eRecipientPhone,
      })
      await writeFile(seedMetadataPath, JSON.stringify(parsedMetadata, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      })
      return { metadata: parsedMetadata, wahaPort: wahaFixture.port }
    } finally {
      await database.close()
    }
  } catch (error) {
    await wahaFixture.stop()
    throw error
  }
}

function encryptedApiKey(
  cipher: ReturnType<typeof import("@waha-command-center/config").createEnvelopeCipher>,
): Readonly<{
  readonly apiKeyCiphertext: string
  readonly apiKeyNonce: string
  readonly apiKeyAuthTag: string
}> {
  const envelope = cipher.encrypt(`e2e-api-key-${crypto.randomUUID()}`, {
    accountScope: "personal",
  })
  return {
    apiKeyCiphertext: envelope.ciphertext,
    apiKeyNonce: envelope.nonce,
    apiKeyAuthTag: envelope.authTag,
  }
}

async function startWahaFixture(
  sessions: readonly WahaFixtureSession[],
  recipientPhone: string,
): Promise<WahaFixture> {
  let server: ReturnType<typeof createServer>
  server = createServer((request, response) =>
    handleWahaRequest(request, response, sessions, recipientPhone, server),
  )
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    await closeServer(server)
    throw new Error("E2E WAHA fixture did not expose a port")
  }
  return { port: address.port, stop: () => closeServer(server) }
}

function handleWahaRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  sessions: readonly WahaFixtureSession[],
  recipientPhone: string,
  server: ReturnType<typeof createServer>,
): void {
  if (request.url === "/api/sessions" && request.method === "GET") {
    sendJson(
      response,
      200,
      sessions.map((session) => ({
        name: session.name,
        presence: {},
        timestamps: { activity: null },
        status: session.status,
      })),
    )
    return
  }
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
  const sessionReadMatch = /^\/api\/sessions\/([^/]+)\/(timelock|capping)$/.exec(
    requestUrl.pathname,
  )
  if (sessionReadMatch && request.method === "GET") {
    const session = decodeURIComponent(sessionReadMatch[1] ?? "")
    const operation = sessionReadMatch[2]
    if (sessions.some((item) => item.name === session)) {
      sendJson(response, 200, operation === "timelock" ? { locked: false } : { remaining: 20 })
      return
    }
    sendJson(response, 404, { error: "session not found" })
    return
  }
  if (requestUrl.pathname === "/api/contacts/check-exists" && request.method === "GET") {
    const session = requestUrl.searchParams.get("session")
    const phone = requestUrl.searchParams.get("phone")
    if (session && phone === recipientPhone && sessions.some((item) => item.name === session)) {
      sendJson(response, 200, { numberExists: true, chatId: e2eRecipientChatId })
      return
    }
    sendJson(response, 404, { error: "contact not found" })
    return
  }
  const contactMatch = /^\/api\/([^/]+)\/contacts\/([^/]+)$/.exec(requestUrl.pathname)
  if (contactMatch && request.method === "GET") {
    const session = decodeURIComponent(contactMatch[1] ?? "")
    const contactId = decodeURIComponent(contactMatch[2] ?? "")
    if (sessions.some((item) => item.name === session) && contactId === e2eRecipientChatId) {
      sendJson(response, 200, {
        id: e2eRecipientChatId,
        name: "E2E schedule recipient",
      })
      return
    }
    sendJson(response, 404, { error: "contact not found" })
    return
  }
  if (request.url === "/__e2e/shutdown" && request.method === "POST") {
    sendJson(response, 204, undefined)
    setImmediate(() => server.close())
    return
  }
  sendJson(response, 404, { error: "not found" })
}

function sendJson(response: ServerResponse<IncomingMessage>, status: number, body: unknown): void {
  response.statusCode = status
  if (body === undefined) {
    response.end()
    return
  }
  response.setHeader("content-type", "application/json")
  response.end(JSON.stringify(body))
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
