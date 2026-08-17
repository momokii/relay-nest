import type postgres from "postgres"

import type { AccountScope } from "../db/schema/shared"
import { type BackupPayload, parseBackupPayload } from "./format"
import { BackupRepositoryError, validateRestoreReferences } from "./relational-validation"

type SqlClient = ReturnType<typeof postgres>
type BackupScalar = string | number | boolean | null
type BackupRow = Record<string, BackupScalar>
type TableDescriptor = {
  readonly name: string
  readonly destination: string
  readonly query: string
}
type ExportPageMetadata = {
  readonly row_id: unknown
  readonly json_bytes: unknown
}

export const BACKUP_TRANSFER_LIMITS = {
  exportPageRows: 100,
  restoreChunkRows: 250,
  maxRows: 10_000,
  maxBytes: 8 * 1024 * 1024,
} as const

const TABLE_DESCRIPTORS = [
  descriptor(
    "users",
    "users",
    "SELECT DISTINCT u.* FROM users u WHERE (EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.account_scope = $1) OR EXISTS (SELECT 1 FROM audit_entries a WHERE a.actor_user_id = u.id AND a.account_scope = $1) OR EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.account_scope = $1)) AND u.id > $2::uuid ORDER BY u.id",
  ),
  descriptor(
    "userRoles",
    "user_roles",
    "SELECT r.* FROM user_roles r WHERE r.account_scope = $1 AND r.id > $2::uuid ORDER BY r.id",
  ),
  descriptor(
    "wahaConnections",
    "waha_connections",
    "SELECT DISTINCT c.* FROM waha_connections c INNER JOIN sessions s ON s.connection_id = c.id WHERE s.account_scope = $1 AND c.id > $2::uuid ORDER BY c.id",
  ),
  descriptor(
    "sessions",
    "sessions",
    "SELECT s.* FROM sessions s WHERE s.account_scope = $1 AND s.id > $2::uuid ORDER BY s.id",
  ),
  descriptor(
    "sessionGrants",
    "session_grants",
    "SELECT g.* FROM session_grants g WHERE g.account_scope = $1 AND g.id > $2::uuid ORDER BY g.id",
  ),
  descriptor(
    "contacts",
    "contacts",
    "SELECT c.* FROM contacts c WHERE c.account_scope = $1 AND c.id > $2::uuid ORDER BY c.id",
  ),
  descriptor(
    "scheduledJobs",
    "scheduled_jobs",
    "SELECT j.* FROM scheduled_jobs j WHERE j.account_scope = $1 AND j.id > $2::uuid ORDER BY j.id",
  ),
  descriptor(
    "dispatchAttempts",
    "dispatch_attempts",
    "SELECT a.* FROM dispatch_attempts a WHERE a.account_scope = $1 AND a.id > $2::uuid ORDER BY a.id",
  ),
  descriptor(
    "normalizedEvents",
    "normalized_events",
    "SELECT e.* FROM normalized_events e WHERE e.account_scope = $1 AND e.id > $2::uuid ORDER BY e.id",
  ),
  descriptor(
    "sessionMessagingSafety",
    "session_messaging_safety",
    "SELECT s.* FROM session_messaging_safety s WHERE s.account_scope = $1 AND s.id > $2::uuid ORDER BY s.id",
  ),
  descriptor(
    "notifications",
    "notifications",
    "SELECT n.* FROM notifications n WHERE n.account_scope = $1 AND n.id > $2::uuid ORDER BY n.id",
  ),
  descriptor(
    "notificationProviderSettings",
    "notification_provider_settings",
    "SELECT s.* FROM notification_provider_settings s WHERE s.account_scope = $1 AND s.id > $2::uuid ORDER BY s.id",
  ),
  descriptor(
    "notificationPreferences",
    "notification_preferences",
    "SELECT p.* FROM notification_preferences p WHERE p.account_scope = $1 AND p.id > $2::uuid ORDER BY p.id",
  ),
  descriptor(
    "retentionPolicies",
    "retention_policies",
    "SELECT p.* FROM retention_policies p WHERE p.account_scope = $1 AND p.id > $2::uuid ORDER BY p.id",
  ),
  descriptor(
    "auditEntries",
    "audit_entries",
    "SELECT a.* FROM audit_entries a WHERE a.account_scope = $1 AND a.id > $2::uuid ORDER BY a.id",
  ),
] as const

const TABLE_NAMES = new Set<string>(TABLE_DESCRIPTORS.map((descriptor) => descriptor.name))

export function createBackupRepository(sql: SqlClient) {
  return {
    exportScope: async (accountScope: AccountScope): Promise<BackupPayload> => {
      return sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (transaction) => {
        const tables: Record<string, readonly BackupRow[]> = {}
        let totalRows = 0
        let totalBytes = 0
        for (const descriptor of TABLE_DESCRIPTORS) {
          const rows: BackupRow[] = []
          let cursor = "00000000-0000-0000-0000-000000000000"
          while (true) {
            const metadata = await transaction.unsafe<ExportPageMetadata[]>(
              `SELECT rows.id AS row_id, octet_length(row_to_json(rows)::text) AS json_bytes FROM (${descriptor.query}) rows LIMIT $3`,
              [accountScope, cursor, BACKUP_TRANSFER_LIMITS.exportPageRows],
            )
            const pageRowCount = selectPageRowCount(metadata)
            if (pageRowCount === 0) break

            const result = await transaction.unsafe<{ row: unknown }[]>(
              `SELECT row_to_json(rows) AS row FROM (${descriptor.query}) rows LIMIT $3`,
              [accountScope, cursor, pageRowCount],
            )
            const page = result.map((item) => parseRow(item.row))
            if (page.length === 0) throw new BackupRepositoryError("backup rows are malformed")
            for (const row of page) {
              totalRows += 1
              totalBytes += Buffer.byteLength(JSON.stringify(row), "utf8")
              if (
                totalRows > BACKUP_TRANSFER_LIMITS.maxRows ||
                totalBytes > BACKUP_TRANSFER_LIMITS.maxBytes
              ) {
                throw new BackupRepositoryError("backup transfer exceeds its fixed limit")
              }
              rows.push(row)
            }
            const lastRow = page.at(-1)
            if (!lastRow) throw new BackupRepositoryError("backup rows are malformed")
            cursor = requiredRowId(lastRow)
            if (metadata.length < BACKUP_TRANSFER_LIMITS.exportPageRows) break
          }
          tables[descriptor.name] = rows
        }
        return parseBackupPayload({ accountScope, tables })
      })
    },
    restoreScope: async (input: BackupPayload): Promise<void> => {
      const payload = parseBackupPayload(input)
      validateTableKeys(payload)
      enforceTransferLimits(payload)
      await sql.begin(async (transaction) => {
        await validateRestoreReferences(transaction, payload, payload.accountScope)
        for (const descriptor of TABLE_DESCRIPTORS) {
          const rows = payload.tables[descriptor.name]
          if (!rows || rows.length === 0) continue
          for (
            let offset = 0;
            offset < rows.length;
            offset += BACKUP_TRANSFER_LIMITS.restoreChunkRows
          ) {
            const chunk = rows.slice(offset, offset + BACKUP_TRANSFER_LIMITS.restoreChunkRows)
            await transaction.unsafe(
              `INSERT INTO ${descriptor.destination} SELECT * FROM jsonb_populate_recordset(NULL::${descriptor.destination}, $1::jsonb) ON CONFLICT DO NOTHING`,
              [JSON.stringify(chunk)],
            )
          }
        }
      })
    },
  }
}

function descriptor(name: string, destination: string, query: string): TableDescriptor {
  return { name, destination, query }
}

function selectPageRowCount(metadata: readonly ExportPageMetadata[]): number {
  let pageBytes = 2
  let rowCount = 0
  for (const item of metadata) {
    const jsonBytes = parseJsonBytes(item.json_bytes)
    const candidateBytes = pageBytes + jsonBytes + (rowCount === 0 ? 0 : 1)
    if (candidateBytes > BACKUP_TRANSFER_LIMITS.maxBytes) {
      if (rowCount === 0) throw new BackupRepositoryError("backup page exceeds its fixed limit")
      break
    }
    pageBytes = candidateBytes
    rowCount += 1
  }
  return rowCount
}

function parseJsonBytes(value: unknown): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BackupRepositoryError("backup page metadata is malformed")
  }
  return parsed
}

function validateTableKeys(payload: BackupPayload): void {
  for (const tableName of Object.keys(payload.tables)) {
    if (!TABLE_NAMES.has(tableName))
      throw new BackupRepositoryError("backup table is not supported")
  }
}

function enforceTransferLimits(payload: BackupPayload): void {
  const rows = Object.values(payload.tables).flat()
  const bytes = Buffer.byteLength(JSON.stringify(payload.tables), "utf8")
  if (rows.length > BACKUP_TRANSFER_LIMITS.maxRows || bytes > BACKUP_TRANSFER_LIMITS.maxBytes) {
    throw new BackupRepositoryError("backup transfer exceeds its fixed limit")
  }
}

function parseRow(value: unknown): BackupRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackupRepositoryError("backup row is malformed")
  }
  const parsed: BackupRow = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      item !== null &&
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    ) {
      throw new BackupRepositoryError("backup value is malformed")
    }
    parsed[key] = item
  }
  return parsed
}

function requiredRowId(row: BackupRow): string {
  // biome-ignore lint/complexity/useLiteralKeys: backup rows use PostgreSQL snake_case keys
  const id = row["id"]
  if (typeof id !== "string" || id.length === 0)
    throw new BackupRepositoryError("backup row is malformed")
  return id
}

export { BackupRepositoryError }
