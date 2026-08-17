import type postgres from "postgres"

import type { AccountScope } from "../db/schema/shared"
import { type BackupPayload, parseBackupPayload } from "./format"

type SqlClient = ReturnType<typeof postgres>

const TABLE_NAMES = [
  "users",
  "userRoles",
  "wahaConnections",
  "sessions",
  "sessionGrants",
  "contacts",
  "scheduledJobs",
  "dispatchAttempts",
  "normalizedEvents",
  "notifications",
  "notificationProviderSettings",
  "notificationPreferences",
  "retentionPolicies",
  "auditEntries",
] as const

type TableName = (typeof TABLE_NAMES)[number]

const tableQueries: Readonly<Record<TableName, string>> = {
  users: `SELECT u.* FROM users u INNER JOIN user_roles r ON r.user_id = u.id WHERE r.account_scope = $1`,
  userRoles: `SELECT r.* FROM user_roles r WHERE r.account_scope = $1`,
  wahaConnections: `SELECT DISTINCT c.* FROM waha_connections c INNER JOIN sessions s ON s.connection_id = c.id WHERE s.account_scope = $1`,
  sessions: `SELECT s.* FROM sessions s WHERE s.account_scope = $1`,
  sessionGrants: `SELECT g.* FROM session_grants g WHERE g.account_scope = $1`,
  contacts: `SELECT c.* FROM contacts c WHERE c.account_scope = $1`,
  scheduledJobs: `SELECT j.* FROM scheduled_jobs j WHERE j.account_scope = $1`,
  dispatchAttempts: `SELECT a.* FROM dispatch_attempts a WHERE a.account_scope = $1`,
  normalizedEvents: `SELECT e.* FROM normalized_events e WHERE e.account_scope = $1`,
  notifications: `SELECT n.* FROM notifications n WHERE n.account_scope = $1`,
  notificationProviderSettings: `SELECT s.* FROM notification_provider_settings s WHERE s.account_scope = $1`,
  notificationPreferences: `SELECT p.* FROM notification_preferences p WHERE p.account_scope = $1`,
  retentionPolicies: `SELECT p.* FROM retention_policies p WHERE p.account_scope = $1`,
  auditEntries: `SELECT a.* FROM audit_entries a WHERE a.account_scope = $1`,
}

const tableDestinations: Readonly<Record<TableName, string>> = {
  users: "users",
  userRoles: "user_roles",
  wahaConnections: "waha_connections",
  sessions: "sessions",
  sessionGrants: "session_grants",
  contacts: "contacts",
  scheduledJobs: "scheduled_jobs",
  dispatchAttempts: "dispatch_attempts",
  normalizedEvents: "normalized_events",
  notifications: "notifications",
  notificationProviderSettings: "notification_provider_settings",
  notificationPreferences: "notification_preferences",
  retentionPolicies: "retention_policies",
  auditEntries: "audit_entries",
}

export function createBackupRepository(sql: SqlClient) {
  return {
    exportScope: async (accountScope: AccountScope): Promise<BackupPayload> => {
      const tables: Record<string, readonly Record<string, string | number | boolean | null>[]> = {}
      for (const tableName of TABLE_NAMES) {
        const query = tableQueries[tableName]
        const [result] = await sql.unsafe<{ rows: unknown }[]>(
          `SELECT COALESCE(json_agg(row_to_json(rows)), '[]'::json) AS rows FROM (${query}) rows`,
          [accountScope],
        )
        tables[tableName] = parseRows(result?.rows)
      }
      return parseBackupPayload({ accountScope, tables })
    },
    restoreScope: async (payload: BackupPayload): Promise<void> => {
      await sql.begin(async (transaction) => {
        for (const tableName of TABLE_NAMES) {
          const rows = payload.tables[tableName]
          if (!rows || rows.length === 0) continue
          const destination = tableDestinations[tableName]
          await transaction.unsafe(
            `INSERT INTO ${destination} SELECT * FROM jsonb_populate_recordset(NULL::${destination}, $1::jsonb) ON CONFLICT DO NOTHING`,
            [JSON.stringify(rows)],
          )
        }
      })
    },
  }
}

function parseRows(value: unknown): readonly Record<string, string | number | boolean | null>[] {
  if (!Array.isArray(value)) throw new BackupRepositoryError("backup rows are malformed")
  return value.map((row) => {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      throw new BackupRepositoryError("backup row is malformed")
    const entries = Object.entries(row)
    const parsed: Record<string, string | number | boolean | null> = {}
    for (const [key, item] of entries) {
      if (
        item !== null &&
        typeof item !== "string" &&
        typeof item !== "number" &&
        typeof item !== "boolean"
      )
        throw new BackupRepositoryError("backup value is malformed")
      parsed[key] = item
    }
    return parsed
  })
}

export class BackupRepositoryError extends Error {
  readonly name = "BackupRepositoryError"
}
