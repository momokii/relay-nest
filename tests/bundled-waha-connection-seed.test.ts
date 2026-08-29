import { describe, expect, it } from "vitest"

import {
  type BundledConnectionSeedRepositories,
  seedBundledWahaConnection,
} from "../apps/api/src/waha/bundled-connection-seed"
import { createEnvelopeCipher } from "../packages/config/src/encryption"

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64")
const ENVIRONMENT = {
  ENCRYPTION_MASTER_KEY: MASTER_KEY,
  WAHA_API_KEY: "bundled-waha-api-key",
}

function fakeRepositories(existingName: string | null): {
  state: { created: Record<string, unknown> | null }
  wahaConnections: BundledConnectionSeedRepositories["wahaConnections"]
} {
  const state: { created: Record<string, unknown> | null } = { created: null }
  return {
    state,
    wahaConnections: {
      findByName: async (name: string) => (existingName === name ? { name } : null),
      create: async (input) => {
        state.created = input
        return input
      },
    },
  }
}

describe("bundled WAHA connection seed", () => {
  it("creates an encrypted bundled connection at startup", async () => {
    // Given a bundled base URL, a master key, and the WAHA API key secret
    const repositories = fakeRepositories(null)

    // When the startup seed runs
    const outcome = await seedBundledWahaConnection({
      repositories,
      baseUrl: "http://waha:3000",
      environment: ENVIRONMENT,
      readFile: () => "bundled-waha-api-key",
    })

    // Then the bundled connection is created, encrypted with the personal envelope
    expect(outcome).toBe("created")
    const connection = repositories.state.created as {
      name: string
      baseUrl: string
      active: boolean
      apiKeyCiphertext: string
      apiKeyNonce: string
      apiKeyAuthTag: string
    } | null
    expect(connection?.name).toBe("bundled-waha")
    expect(connection?.baseUrl).toBe("http://waha:3000")
    expect(connection?.active).toBe(true)
    const decrypted = createEnvelopeCipher(Buffer.from(MASTER_KEY, "base64")).decrypt(
      {
        version: 1,
        algorithm: "aes-256-gcm",
        ciphertext: connection?.apiKeyCiphertext ?? "",
        nonce: connection?.apiKeyNonce ?? "",
        authTag: connection?.apiKeyAuthTag ?? "",
      },
      { accountScope: "personal" },
    )
    expect(decrypted).toBe("bundled-waha-api-key")
  })

  it("keeps an existing bundled connection without rewriting it", async () => {
    // Given the bundled connection already exists from a previous startup
    const repositories = fakeRepositories("bundled-waha")

    // When the startup seed runs
    const outcome = await seedBundledWahaConnection({
      repositories,
      baseUrl: "http://waha:3000",
      environment: ENVIRONMENT,
      readFile: () => "bundled-waha-api-key",
    })

    // Then the seed reports presence and creates nothing
    expect(outcome).toBe("present")
    expect(repositories.state.created).toBeNull()
  })

  it("skips external provider base URLs", async () => {
    // Given an operator-approved external WAHA base URL
    const repositories = fakeRepositories(null)

    // When the startup seed runs
    const outcome = await seedBundledWahaConnection({
      repositories,
      baseUrl: "https://waha.example.com",
      environment: ENVIRONMENT,
      readFile: () => "bundled-waha-api-key",
    })

    // Then nothing is created because external connections are Admin-configured
    expect(outcome).toBe("skipped")
    expect(repositories.state.created).toBeNull()
  })

  it("skips when no WAHA API key source is configured", async () => {
    // Given an environment without WAHA_API_KEY or WAHA_API_KEY_FILE
    const repositories = fakeRepositories(null)

    // When the startup seed runs
    const outcome = await seedBundledWahaConnection({
      repositories,
      baseUrl: "http://waha:3000",
      environment: { ENCRYPTION_MASTER_KEY: MASTER_KEY },
      readFile: () => "unused",
    })

    // Then nothing is created and the API keeps booting
    expect(outcome).toBe("skipped")
    expect(repositories.state.created).toBeNull()
  })

  it("skips when no encryption master key is configured", async () => {
    // Given an environment without an encryption master key
    const repositories = fakeRepositories(null)

    // When the startup seed runs
    const outcome = await seedBundledWahaConnection({
      repositories,
      baseUrl: "http://waha:3000",
      environment: { WAHA_API_KEY: "bundled-waha-api-key" },
      readFile: () => "bundled-waha-api-key",
    })

    // Then nothing is created because the key could not be encrypted at rest
    expect(outcome).toBe("skipped")
    expect(repositories.state.created).toBeNull()
  })
})
