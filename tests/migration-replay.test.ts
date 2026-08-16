import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

import { createDatabase } from "../apps/api/src/db/client"

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)("raw migration replay", () => {
  it("executes the migration file twice without destructive reset", async () => {
    // Given the raw migration file and a disposable PostgreSQL database
    const migration = await readFile(
      new URL("../apps/api/drizzle/0000_tranquil_magik.sql", import.meta.url),
      "utf8",
    )
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
    const database = createDatabase(databaseUrl)

    // When every raw statement is executed twice in order
    for (let pass = 0; pass < 2; pass += 1) {
      for (const statement of statements) await database.sql.unsafe(statement)
    }

    // Then the migration remains present and the database is usable
    const result = await database.sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_entries'
    `
    await database.close()
    expect(result).toHaveLength(1)
  })
})
