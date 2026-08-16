import { afterAll, describe, expect, it } from "vitest"

import { createDatabase } from "../apps/api/src/db/client"

const databaseUrl = process.env.TASK5_AUTH_DATABASE_URL ?? process.env.DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined

describe.skipIf(!database)("authentication migrations", () => {
  it("creates the shared limiter with an integer counter", async () => {
    // Given a database migrated through the auth migrations
    const columns = await database.sql<
      { table_name: string; column_name: string; data_type: string }[]
    >`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'auth_sessions' AND column_name = 'token_hash')
          OR (table_name = 'auth_rate_limits' AND column_name = 'failures'))
      ORDER BY table_name, column_name
    `

    // Then both auth tables and the integer shared counter exist
    expect(columns).toEqual([
      { table_name: "auth_rate_limits", column_name: "failures", data_type: "integer" },
      { table_name: "auth_sessions", column_name: "token_hash", data_type: "text" },
    ])
  })
})

if (database) afterAll(async () => database.close())
