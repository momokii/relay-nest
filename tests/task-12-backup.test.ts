import { describe, expect, it } from "vitest"

import {
  BackupFormatError,
  createEncryptedBackup,
  parseEncryptedBackup,
} from "../apps/api/src/backup/format"
import { createBackupRepository } from "../apps/api/src/backup/repository"

const key = Buffer.alloc(32, 11)

describe("Todo 12 encrypted backup format", () => {
  it("round-trips scoped encrypted database rows and key metadata", () => {
    // Given a scoped backup containing opaque encrypted database fields
    const backup = createEncryptedBackup(
      {
        accountScope: "personal",
        tables: { scheduledJobs: [{ id: "job-1", messageCiphertext: "opaque-message" }] },
      },
      key,
    )

    // When an administrator restores it with the current master key
    const restored = parseEncryptedBackup(backup, key, "personal")

    // Then the encrypted values and non-secret key metadata survive the round trip
    expect(restored.accountScope).toBe("personal")
    expect(restored.tables.scheduledJobs).toEqual([
      { id: "job-1", messageCiphertext: "opaque-message" },
    ])
    expect(restored.keyMetadata).toMatchObject({ version: 1 })
    expect(JSON.stringify(backup)).not.toContain("opaque-message")
  })

  it("fails closed for a missing, wrong, cross-scope, or tampered key", () => {
    // Given a valid encrypted backup
    const backup = createEncryptedBackup(
      { accountScope: "business", tables: { contacts: [{ id: "contact-1" }] } },
      key,
    )

    // When restore is attempted outside its authenticated scope or with invalid key material
    expect(() => parseEncryptedBackup(backup, key, "personal")).toThrow(BackupFormatError)
    expect(() => parseEncryptedBackup(backup, Buffer.alloc(32, 12), "business")).toThrow(
      BackupFormatError,
    )
    expect(() => parseEncryptedBackup(backup, undefined, "business")).toThrow(BackupFormatError)
    expect(() =>
      parseEncryptedBackup({ ...backup, ciphertext: `${backup.ciphertext}A` }, key, "business"),
    ).toThrow(BackupFormatError)
    expect(() =>
      createEncryptedBackup(
        {
          accountScope: "personal",
          tables: { jobs: [{ account_scope: "business", id: "job-2" }] },
        },
        key,
      ),
    ).toThrow(BackupFormatError)
  })

  it.each([
    ["format", { format: "forged-backup" }],
    ["version", { version: 1 }],
    ["account scope", { accountScope: "personal" }],
    ["key metadata", { keyMetadata: { version: 1, fingerprint: "forged" } }],
    ["authentication tag", { authTag: "malformed" }],
  ])("rejects tampered outer %s", (_field, change) => {
    // Given a valid encrypted backup whose outer metadata is modified
    const backup = createEncryptedBackup(
      { accountScope: "business", tables: { contacts: [{ id: "contact-1" }] } },
      key,
    )

    // When restore is attempted with the modified envelope
    const tamperedBackup = { ...backup, ...change }

    // Then authentication fails closed without returning plaintext
    expect(() => parseEncryptedBackup(tamperedBackup, key, "business")).toThrow(BackupFormatError)
  })

  it("rejects an unknown table key at the restore seam", async () => {
    // Given a payload containing a table outside the backup allowlist
    const repository = createBackupRepository({
      unsafe: async () => [],
      begin: async () => undefined,
    })

    // When restore is attempted
    const restore = repository.restoreScope({
      accountScope: "personal",
      tables: { unknownTable: [{ id: "opaque" }] },
    })

    // Then the unknown key is rejected before a transaction can write
    await expect(restore).rejects.toThrow("backup table is not supported")
  })
})
