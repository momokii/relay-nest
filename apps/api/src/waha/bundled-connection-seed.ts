import { readFileSync } from "node:fs"

import { createEnvelopeCipher, resolveEncryptionMasterKey } from "@waha-command-center/config"
import { z } from "zod"

import { isBundledWahaBaseUrl } from "./url-policy"

const BUNDLED_CONNECTION_NAME = "bundled-waha"

const seedEnvironmentSchema = z.object({
  WAHA_API_KEY: z.string().min(1).optional(),
  WAHA_API_KEY_FILE: z.string().min(1).optional(),
})

export type BundledConnectionSeedRepositories = {
  readonly wahaConnections: {
    readonly findByName: (name: string) => Promise<{ readonly name: string } | null>
    readonly create: (input: {
      readonly name: string
      readonly baseUrl: string
      readonly apiKeyCiphertext: string
      readonly apiKeyNonce: string
      readonly apiKeyAuthTag: string
      readonly active: boolean
    }) => Promise<unknown>
  }
}

export type BundledConnectionSeedResult = "created" | "present" | "skipped"

export async function seedBundledWahaConnection(input: {
  readonly repositories: BundledConnectionSeedRepositories
  readonly baseUrl: string
  readonly environment: Readonly<Record<string, string | undefined>>
  readonly readFile?: (path: string) => string
}): Promise<BundledConnectionSeedResult> {
  if (!isBundledWahaBaseUrl(input.baseUrl)) return "skipped"
  const parsedEnvironment = seedEnvironmentSchema.safeParse(input.environment)
  if (!parsedEnvironment.success) return "skipped"
  if (
    parsedEnvironment.data.WAHA_API_KEY === undefined &&
    parsedEnvironment.data.WAHA_API_KEY_FILE === undefined
  ) {
    return "skipped"
  }
  const masterKey = resolveEncryptionMasterKey(input.environment)
  if (!masterKey) return "skipped"

  const existing = await input.repositories.wahaConnections.findByName(BUNDLED_CONNECTION_NAME)
  if (existing) return "present"

  const readFile = input.readFile ?? ((path: string) => readFileSync(path, "utf8"))
  const keyFile = parsedEnvironment.data.WAHA_API_KEY_FILE
  const apiKey = (parsedEnvironment.data.WAHA_API_KEY ?? (keyFile ? readFile(keyFile) : "")).trim()
  if (apiKey.length === 0) return "skipped"

  const envelope = createEnvelopeCipher(masterKey).encrypt(apiKey, { accountScope: "personal" })
  await input.repositories.wahaConnections.create({
    name: BUNDLED_CONNECTION_NAME,
    baseUrl: input.baseUrl,
    apiKeyCiphertext: envelope.ciphertext,
    apiKeyNonce: envelope.nonce,
    apiKeyAuthTag: envelope.authTag,
    active: true,
  })
  return "created"
}
