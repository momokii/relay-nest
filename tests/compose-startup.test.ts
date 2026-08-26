import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

async function readComposeFile(name: string): Promise<string> {
  return readFile(new URL(`../${name}`, import.meta.url), "utf8")
}

function serviceBlock(composeFile: string, serviceName: string): string {
  const lines = composeFile.split("\n")
  const start = lines.findIndex((line) => line === `  ${serviceName}:`)
  if (start < 0) throw new Error(`Compose service not found: ${serviceName}`)

  const block: string[] = []
  for (const line of lines.slice(start)) {
    if (block.length > 0 && /^ {2}[a-z][a-z0-9-]*:\s*$/.test(line)) break
    block.push(line)
  }
  return block.join("\n")
}

describe("default Compose API startup", () => {
  it("ships and runs database migrations before accepting bootstrap requests", async () => {
    // Given the default API image and its bundled startup entry point
    const dockerfile = await readFile(new URL("../Dockerfile.api", import.meta.url), "utf8")
    const entryPoint = await readFile(new URL("../apps/api/src/index.ts", import.meta.url), "utf8")

    // Then startup has the migration assets and executes them before listening
    expect(dockerfile).toContain(
      "COPY --from=build --chown=node:node /workspace/apps/api/drizzle ./drizzle",
    )
    expect(entryPoint).toContain('process.env["MIGRATIONS_FOLDER"] ?? "drizzle"')
    const migrationCall = entryPoint.indexOf("await migrate(database.db, { migrationsFolder })")
    const listenCall = entryPoint.indexOf("await app.listen")
    expect(migrationCall).toBeGreaterThanOrEqual(0)
    expect(listenCall).toBeGreaterThan(migrationCall)
  })

  it("injects the encryption key through a Docker secret file", async () => {
    // Given the production API service and its Compose secret declarations
    const compose = await readComposeFile("docker-compose.yml")
    const apiService = serviceBlock(compose, "api")

    // Then the API receives only a mounted secret path, never a resolved key value
    expect(apiService).toContain("ENCRYPTION_MASTER_KEY_FILE: /run/secrets/encryption_master_key")
    expect(apiService).toContain("- encryption_master_key")
    expect(compose).toContain("encryption_master_key:\n    file:")
    expect(compose).toContain(
      "ENCRYPTION_MASTER_KEY_FILE:?Set ENCRYPTION_MASTER_KEY_FILE to a secret file}",
    )
    expect(compose).not.toMatch(/^\s+ENCRYPTION_MASTER_KEY:\s+\$\{/m)
  })

  it("keeps application runtime images non-root", async () => {
    // Given the API and web production runtime images
    const apiDockerfile = await readComposeFile("Dockerfile.api")
    const webDockerfile = await readComposeFile("Dockerfile.web")

    // Then both application processes explicitly drop to the node user
    expect(apiDockerfile).toContain("USER node")
    expect(webDockerfile).toContain("USER node")
  })

  it("health-checks the web service after the API becomes healthy", async () => {
    // Given the web service depends on the migrated, healthy API
    const compose = await readComposeFile("docker-compose.yml")
    const webService = serviceBlock(compose, "web")

    // Then the web service exposes its own readiness signal for Compose
    expect(webService).toContain("healthcheck:")
    expect(webService).toContain("http://127.0.0.1:4173/")
  })

  it("allows the API migration-before-listen startup window before health failures count", async () => {
    // Given the API cannot listen until its mandatory database migration completes
    const compose = await readComposeFile("docker-compose.yml")
    const apiService = serviceBlock(compose, "api")

    // Then transient startup probes do not mark a correctly migrating API unhealthy
    expect(apiService).toContain("start_period: 30s")
  })

  it("gates bundled API startup on the documented internal WAHA health endpoint", async () => {
    // Given the bundled-WAHA overlay and the base internal service definition
    const compose = await readComposeFile("docker-compose.yml")
    const bundled = await readComposeFile("docker-compose.bundled-waha.yml")
    const wahaService = serviceBlock(compose, "waha")

    // Then WAHA stays unpublished and bundled startup waits for health, not just process creation
    expect(wahaService).toContain('expose:\n      - "3000"')
    expect(wahaService).not.toContain("ports:")
    expect(bundled).toContain("healthcheck:")
    expect(bundled).toContain("/health")
    expect(bundled).toContain("condition: service_healthy")
    expect(wahaService).toContain('entrypoint: ["/bin/sh", "-c"]')
    expect(wahaService).toContain("Bundled WAHA is disabled")
    expect(wahaService).toContain('restart: "no"')
    expect(bundled).not.toMatch(/(?:WAHA|WHATSAPP)_API_KEY/)
  })

  it("persists bundled WAHA sessions without publishing the WAHA port", async () => {
    // Given the base definition of the bundled-only WAHA service
    const compose = await readComposeFile("docker-compose.yml")
    const wahaService = serviceBlock(compose, "waha")

    // Then its session directory uses a declared named volume and remains internal
    expect(wahaService).toContain("- waha-sessions:/app/.sessions")
    expect(wahaService).not.toContain("ports:")
    expect(compose).toContain("waha-sessions:")
  })

  it("documents mutually exclusive encryption-key sources in the copyable environment", async () => {
    // Given the environment template copied by a non-production operator
    const environmentExample = await readComposeFile(".env.example")

    // Then neither alternative is active until the operator deliberately chooses one
    expect(environmentExample).toContain(
      "# ENCRYPTION_MASTER_KEY_FILE=.secrets/encryption_master_key",
    )
    expect(environmentExample).toContain(
      "# ENCRYPTION_MASTER_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    )
    expect(environmentExample).toContain("Uncomment exactly one encryption key source")
    expect(environmentExample).not.toMatch(/^ENCRYPTION_MASTER_KEY(?:_FILE)?=/m)
    expect(environmentExample).not.toMatch(/^WAHA_API_KEY=/m)
  })

  it("uses tested immutable references for the application and database images", async () => {
    // Given the images used by the application and Postgres services
    const compose = await readComposeFile("docker-compose.yml")
    const apiDockerfile = await readComposeFile("Dockerfile.api")
    const webDockerfile = await readComposeFile("Dockerfile.web")

    // Then every available application/database image reference is digest-pinned
    expect(compose).toContain(
      "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94",
    )
    expect(apiDockerfile).toContain(
      "FROM node:22.23.1-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build",
    )
    expect(webDockerfile).toContain(
      "FROM node:22.23.1-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build",
    )
  })
})
