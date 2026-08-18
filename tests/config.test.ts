import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { parseWorkspaceEnvironment, resolveDatabaseUrl } from "../packages/config/src/index"

describe("database configuration", () => {
  it("rejects test mode unless the runtime is also test mode", () => {
    // Given a process that claims production while requesting test-only behavior
    const environment = { APP_ENV: "test", NODE_ENV: "production" }

    // When the shared environment boundary is parsed
    // Then test-only runtime permissions cannot enter production
    expect(() => parseWorkspaceEnvironment(environment)).toThrowError(/test mode/i)
  })

  it("resolves Compose variables to the postgres service", () => {
    // Given the variables supplied by the Compose API service
    const environment = {
      DATABASE_HOST: "postgres",
      DATABASE_PORT: "5432",
      DATABASE_NAME: "waha_command_center",
      DATABASE_USER: "app",
      DATABASE_PASSWORD: "compose-secret",
    }

    // When the shared database configuration is resolved
    const databaseUrl = resolveDatabaseUrl(environment)

    // Then the API and migration tools receive the same postgres URL
    expect(databaseUrl).toBe("postgresql://app:compose-secret@postgres:5432/waha_command_center")
  })

  it("rejects incomplete or non-PostgreSQL configuration", () => {
    // Given incomplete Compose variables and an unsupported URL
    const incomplete = { DATABASE_HOST: "postgres" }
    const unsupported = { DATABASE_URL: "https://example.invalid/database" }

    // When either invalid configuration is resolved
    // Then configuration fails without falling back to localhost
    expect(() => resolveDatabaseUrl(incomplete)).toThrowError(/database configuration/i)
    expect(() => resolveDatabaseUrl(unsupported)).toThrowError(/database configuration/i)
  })

  it("reads the Compose password from its Docker secret file", () => {
    // Given a Compose password secret mounted as a file
    const directory = mkdtempSync(join(tmpdir(), "waha-config-"))
    const passwordFile = join(directory, "postgres_password")
    writeFileSync(passwordFile, "compose-file-secret\n", "utf8")

    try {
      // When the shared database configuration is resolved
      const databaseUrl = resolveDatabaseUrl({
        DATABASE_HOST: "postgres",
        DATABASE_PORT: "5432",
        DATABASE_NAME: "waha_command_center",
        DATABASE_USER: "app",
        DATABASE_PASSWORD_FILE: passwordFile,
      })

      // Then the secret is used without appearing in environment configuration
      expect(databaseUrl).toBe(
        "postgresql://app:compose-file-secret@postgres:5432/waha_command_center",
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
