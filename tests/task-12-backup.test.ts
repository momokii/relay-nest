import { describe, expect, it } from "vitest"

import {
  BackupFormatError,
  createEncryptedBackup,
  parseEncryptedBackup,
} from "../apps/api/src/backup/format"

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
})
