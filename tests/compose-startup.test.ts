import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

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
})
