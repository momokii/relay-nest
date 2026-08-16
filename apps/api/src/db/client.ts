import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "./schema"

export type PersistenceDatabase = ReturnType<typeof drizzle<typeof schema>>

export type DatabaseHandle = {
  readonly db: PersistenceDatabase
  readonly sql: ReturnType<typeof postgres>
  readonly close: () => Promise<void>
}

export function createDatabase(connectionString: string): DatabaseHandle {
  const sql = postgres(connectionString)
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end(),
  }
}
