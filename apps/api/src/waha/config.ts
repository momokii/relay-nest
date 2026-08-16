import { createEnvelopeCipher, type EncryptedEnvelope } from "@waha-command-center/config"

import type { WahaConnectionUrlError } from "./url-policy"
import { validateWahaBaseUrl } from "./url-policy"

export type WahaRole = "admin" | "operator" | "viewer"

export type WahaConnectionConfig = {
  readonly name: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly active: boolean
}

export type WahaPublicConnectionConfig = Omit<WahaConnectionConfig, "apiKey">

export type WahaStoredConnection = {
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly apiKeyCiphertext: string
  readonly apiKeyNonce: string
  readonly apiKeyAuthTag: string
  readonly active: boolean
}

export type WahaConnectionRepository = {
  readonly create: (input: {
    readonly name: string
    readonly baseUrl: string
    readonly apiKeyCiphertext: string
    readonly apiKeyNonce: string
    readonly apiKeyAuthTag: string
    readonly active: boolean
  }) => Promise<WahaStoredConnection>
  readonly update: (
    id: string,
    input: {
      readonly name: string
      readonly baseUrl: string
      readonly apiKeyCiphertext: string
      readonly apiKeyNonce: string
      readonly apiKeyAuthTag: string
      readonly active: boolean
    },
  ) => Promise<WahaStoredConnection>
}

export class WahaAdminRequiredError extends Error {
  readonly name = "WahaAdminRequiredError"
}

export function assertAdminRole(role: WahaRole): void {
  if (role !== "admin") throw new WahaAdminRequiredError("Admin role is required for WAHA settings")
}

export function createWahaConnectionConfig(input: {
  readonly name: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly active: boolean
  readonly allowLoopback?: boolean
}): WahaConnectionConfig {
  validateWahaBaseUrl(input.baseUrl, input.allowLoopback ?? false)
  if (input.name.trim().length === 0 || input.apiKey.length === 0) {
    throw new Error("WAHA connection name and API key are required")
  }
  return {
    name: input.name.trim(),
    baseUrl: new URL(input.baseUrl).toString(),
    apiKey: input.apiKey,
    active: input.active,
  }
}

function envelopeColumns(envelope: EncryptedEnvelope): {
  readonly apiKeyCiphertext: string
  readonly apiKeyNonce: string
  readonly apiKeyAuthTag: string
} {
  return {
    apiKeyCiphertext: envelope.ciphertext,
    apiKeyNonce: envelope.nonce,
    apiKeyAuthTag: envelope.authTag,
  }
}

export function createWahaRuntimeSettingsService(
  repository: WahaConnectionRepository,
  masterKey: Buffer | undefined,
) {
  const cipher = createEnvelopeCipher(masterKey)
  return {
    async save(
      role: WahaRole,
      input: Parameters<typeof createWahaConnectionConfig>[0],
      id?: string,
    ) {
      assertAdminRole(role)
      const config = createWahaConnectionConfig(input)
      const envelope = cipher.encrypt(config.apiKey, { accountScope: "personal" })
      const stored = {
        name: config.name,
        baseUrl: config.baseUrl,
        active: config.active,
        ...envelopeColumns(envelope),
      }
      return id ? repository.update(id, stored) : repository.create(stored)
    },
    publicConfig(config: WahaConnectionConfig): WahaPublicConnectionConfig {
      return { name: config.name, baseUrl: config.baseUrl, active: config.active }
    },
  }
}

export type WahaConfigUrlError = WahaConnectionUrlError
