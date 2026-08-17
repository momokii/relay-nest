import {
  createBlindIndex,
  createEnvelopeCipher,
  EnvelopeEncryptionError,
} from "@waha-command-center/config"
import { z } from "zod"

const BACKUP_FORMAT = "waha-command-center-backup"
const BACKUP_VERSION = 2
const accountScopeSchema = z.enum(["personal", "business"])
const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const rowSchema = z.record(z.string(), scalarSchema)
const keyMetadataSchema = z.object({ version: z.literal(1), fingerprint: z.string().min(1) })
export const backupPayloadSchema = z.object({
  accountScope: accountScopeSchema,
  tables: z.record(z.string(), z.array(rowSchema)),
})
const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  accountScope: accountScopeSchema,
  keyMetadata: keyMetadataSchema,
  nonce: z.string(),
  ciphertext: z.string(),
  authTag: z.string(),
})
const authenticatedBackupSchema = z.object({
  metadata: z.object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    accountScope: accountScopeSchema,
    keyMetadata: keyMetadataSchema,
  }),
  payload: backupPayloadSchema,
})

type AccountScope = z.infer<typeof accountScopeSchema>
export type BackupPayload = z.infer<typeof backupPayloadSchema>
export type EncryptedBackup = z.infer<typeof backupSchema>

export class BackupFormatError extends Error {
  readonly name = "BackupFormatError"
}

export function parseBackupPayload(value: unknown): BackupPayload {
  return backupPayloadSchema.parse(value)
}

export function createEncryptedBackup(
  payload: BackupPayload,
  masterKey: Buffer | undefined,
): EncryptedBackup {
  try {
    const parsed = backupPayloadSchema.parse(payload)
    validatePayloadScopes(parsed)
    const cipher = createEnvelopeCipher(masterKey)
    const keyMetadata = {
      version: 1,
      fingerprint: createBlindIndex(masterKey, "waha-command-center-backup-key"),
    } satisfies z.infer<typeof keyMetadataSchema>
    const authenticatedBackup = {
      metadata: {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        accountScope: parsed.accountScope,
        keyMetadata,
      },
      payload: parsed,
    }
    const envelope = cipher.encrypt(JSON.stringify(authenticatedBackup), {
      accountScope: parsed.accountScope,
    })
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      accountScope: parsed.accountScope,
      keyMetadata,
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext,
      authTag: envelope.authTag,
    }
  } catch (error) {
    if (error instanceof BackupFormatError) throw error
    if (error instanceof EnvelopeEncryptionError || error instanceof z.ZodError) {
      throw new BackupFormatError("backup could not be encrypted")
    }
    throw error
  }
}

export function parseEncryptedBackup(
  backup: unknown,
  masterKey: Buffer | undefined,
  expectedScope: AccountScope,
): BackupPayload & { readonly keyMetadata: EncryptedBackup["keyMetadata"] } {
  try {
    const parsed = backupSchema.parse(backup)
    if (parsed.accountScope !== expectedScope) throw new BackupFormatError("backup scope mismatch")
    const cipher = createEnvelopeCipher(masterKey)
    const plaintext = cipher.decrypt(
      {
        version: 1,
        algorithm: "aes-256-gcm",
        nonce: parsed.nonce,
        ciphertext: parsed.ciphertext,
        authTag: parsed.authTag,
      },
      { accountScope: parsed.accountScope },
    )
    const authenticatedBackup = authenticatedBackupSchema.parse(JSON.parse(plaintext))
    if (
      parsed.format !== authenticatedBackup.metadata.format ||
      parsed.version !== authenticatedBackup.metadata.version ||
      parsed.accountScope !== authenticatedBackup.metadata.accountScope ||
      parsed.keyMetadata.version !== authenticatedBackup.metadata.keyMetadata.version ||
      parsed.keyMetadata.fingerprint !== authenticatedBackup.metadata.keyMetadata.fingerprint
    ) {
      throw new BackupFormatError("backup authentication failed")
    }
    const payload = authenticatedBackup.payload
    validatePayloadScopes(payload)
    if (payload.accountScope !== expectedScope) throw new BackupFormatError("backup scope mismatch")
    return { ...payload, keyMetadata: parsed.keyMetadata }
  } catch (error) {
    if (error instanceof BackupFormatError) throw error
    if (
      error instanceof EnvelopeEncryptionError ||
      error instanceof z.ZodError ||
      error instanceof SyntaxError
    ) {
      throw new BackupFormatError("backup authentication failed")
    }
    throw error
  }
}

function validatePayloadScopes(payload: BackupPayload): void {
  for (const rows of Object.values(payload.tables)) {
    for (const row of rows) {
      // biome-ignore lint/complexity/useLiteralKeys: row names are PostgreSQL snake_case
      const rowScope = row["account_scope"]
      if (rowScope !== null && rowScope !== undefined && rowScope !== payload.accountScope)
        throw new BackupFormatError("backup row scope mismatch")
    }
  }
}
