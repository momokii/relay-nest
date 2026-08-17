import type postgres from "postgres"

import type { AccountScope } from "../db/schema/shared"
import type { BackupPayload } from "./format"

type SqlClient = ReturnType<typeof postgres>
type BackupRow = BackupPayload["tables"][string][number]

export class BackupRepositoryError extends Error {
  readonly name = "BackupRepositoryError"
}

const SCOPED_TABLES = [
  "userRoles",
  "sessions",
  "sessionGrants",
  "contacts",
  "scheduledJobs",
  "dispatchAttempts",
  "normalizedEvents",
  "sessionMessagingSafety",
  "notifications",
  "notificationProviderSettings",
  "notificationPreferences",
  "retentionPolicies",
  "auditEntries",
] as const

export async function validateRestoreReferences(
  sql: SqlClient,
  payload: BackupPayload,
  accountScope: AccountScope,
): Promise<void> {
  for (const tableName of SCOPED_TABLES) {
    for (const row of rowsFor(payload, tableName)) {
      // biome-ignore lint/complexity/useLiteralKeys: backup rows use PostgreSQL snake_case keys
      if (row["account_scope"] !== accountScope) throw invalidReference()
      requiredString(row, "id")
    }
  }
  for (const row of rowsFor(payload, "users")) requiredString(row, "id")
  for (const row of rowsFor(payload, "wahaConnections")) requiredString(row, "id")

  const payloadUserIds = new Set(idsFor(payload, "users"))
  const payloadSessionIds = idsFor(payload, "sessions")
  const payloadJobSessions = new Map(
    rowsFor(payload, "scheduledJobs").map((row) => [
      requiredString(row, "id"),
      requiredString(row, "session_id"),
    ]),
  )

  const connectionIds = rowsFor(payload, "sessions").map((row) =>
    requiredString(row, "connection_id"),
  )
  await assertExistingIds(
    sql,
    "waha_connections",
    connectionIds.filter((id) => !idsFor(payload, "wahaConnections").includes(id)),
  )

  await assertUserReferences(
    sql,
    rowsFor(payload, "userRoles").map((row) => requiredString(row, "user_id")),
    payloadUserIds,
  )
  await assertUserReferences(
    sql,
    rowsFor(payload, "sessionGrants").map((row) => requiredString(row, "user_id")),
    payloadUserIds,
  )
  await assertUserReferences(
    sql,
    rowsFor(payload, "notifications").map((row) => requiredString(row, "user_id")),
    payloadUserIds,
  )
  await assertUserReferences(
    sql,
    rowsFor(payload, "auditEntries").flatMap((row) => optionalString(row, "actor_user_id")),
    payloadUserIds,
  )

  await assertSessionReferences(
    sql,
    rowsFor(payload, "sessionGrants"),
    payloadSessionIds,
    accountScope,
  )
  await assertSessionReferences(sql, rowsFor(payload, "contacts"), payloadSessionIds, accountScope)
  await assertSessionReferences(
    sql,
    rowsFor(payload, "scheduledJobs"),
    payloadSessionIds,
    accountScope,
  )
  await assertSessionReferences(
    sql,
    rowsFor(payload, "dispatchAttempts"),
    payloadSessionIds,
    accountScope,
  )
  await assertSessionReferences(
    sql,
    rowsFor(payload, "normalizedEvents"),
    payloadSessionIds,
    accountScope,
  )
  await assertSessionReferences(
    sql,
    rowsFor(payload, "sessionMessagingSafety"),
    payloadSessionIds,
    accountScope,
  )
  await assertOptionalSessionReferences(
    sql,
    rowsFor(payload, "auditEntries"),
    payloadSessionIds,
    accountScope,
  )

  const attemptRows = rowsFor(payload, "dispatchAttempts")
  const payloadJobIds = [...payloadJobSessions.keys()]
  const externalJobIds = attemptRows
    .map((row) => requiredString(row, "job_id"))
    .filter((id) => !payloadJobIds.includes(id))
  const existingJobs = await fetchScopedJobs(sql, externalJobIds, accountScope)
  for (const row of attemptRows) {
    const jobId = requiredString(row, "job_id")
    const sessionId = requiredString(row, "session_id")
    const expectedSessionId = payloadJobSessions.get(jobId) ?? existingJobs.get(jobId)
    if (expectedSessionId !== sessionId) {
      throw invalidReference()
    }
  }
}

function rowsFor(payload: BackupPayload, tableName: string): readonly BackupRow[] {
  return payload.tables[tableName] ?? []
}

function idsFor(payload: BackupPayload, tableName: string): readonly string[] {
  return rowsFor(payload, tableName).map((row) => requiredString(row, "id"))
}

function requiredString(row: BackupRow, column: string): string {
  const value = row[column]
  if (typeof value !== "string" || value.length === 0) throw invalidReference()
  return value
}

function optionalString(row: BackupRow, column: string): readonly string[] {
  const value = row[column]
  if (value === null || value === undefined) return []
  return [requiredString(row, column)]
}

async function assertExistingIds(
  sql: SqlClient,
  table: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return
  const rows = await sql.unsafe<{ id: string }[]>(
    `SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  if (rows.length !== ids.length) throw invalidReference()
}

async function assertScopedIds(
  sql: SqlClient,
  table: string,
  ids: readonly string[],
  accountScope: AccountScope,
): Promise<void> {
  if (ids.length === 0) return
  const rows = await sql.unsafe<{ id: string }[]>(
    `SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) AND account_scope = $2`,
    [ids, accountScope],
  )
  if (rows.length !== ids.length) throw invalidReference()
}

async function fetchScopedJobs(
  sql: SqlClient,
  ids: readonly string[],
  accountScope: AccountScope,
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await sql.unsafe<{ id: string; session_id: string }[]>(
    `SELECT id, session_id FROM scheduled_jobs WHERE id = ANY($1::uuid[]) AND account_scope = $2`,
    [ids, accountScope],
  )
  if (rows.length !== ids.length) throw invalidReference()
  return new Map(rows.map((row) => [row.id, row.session_id]))
}

async function assertUserReferences(
  sql: SqlClient,
  userIds: readonly string[],
  payloadUserIds: ReadonlySet<string>,
): Promise<void> {
  await assertExistingIds(
    sql,
    "users",
    userIds.filter((id) => !payloadUserIds.has(id)),
  )
}

async function assertSessionReferences(
  sql: SqlClient,
  rows: readonly BackupRow[],
  payloadSessionIds: readonly string[],
  accountScope: AccountScope,
): Promise<void> {
  const sessionIds = rows.map((row) => requiredString(row, "session_id"))
  await assertScopedIds(
    sql,
    "sessions",
    sessionIds.filter((id) => !payloadSessionIds.includes(id)),
    accountScope,
  )
}

async function assertOptionalSessionReferences(
  sql: SqlClient,
  rows: readonly BackupRow[],
  payloadSessionIds: readonly string[],
  accountScope: AccountScope,
): Promise<void> {
  const sessionIds = rows.flatMap((row) => optionalString(row, "session_id"))
  await assertScopedIds(
    sql,
    "sessions",
    sessionIds.filter((id) => !payloadSessionIds.includes(id)),
    accountScope,
  )
}

function invalidReference(): BackupRepositoryError {
  return new BackupRepositoryError("backup relational reference is invalid")
}
