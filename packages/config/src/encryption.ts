import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { z } from "zod"

const ENVELOPE_VERSION = 1
const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const KEY_BYTES = 32
const metadataSchema = z.object({ accountScope: z.enum(["personal", "business"]) })
const envelopeSchema = z.object({
  version: z.literal(ENVELOPE_VERSION),
  algorithm: z.literal(ALGORITHM),
  nonce: z.string().regex(/^[A-Za-z0-9+/]+=*$/),
  ciphertext: z.string().regex(/^[A-Za-z0-9+/]+=*$/),
  authTag: z.string().regex(/^[A-Za-z0-9+/]+=*$/),
})

export type EnvelopeMetadata = z.infer<typeof metadataSchema>
export type EncryptedEnvelope = z.infer<typeof envelopeSchema>

export class EnvelopeEncryptionError extends Error {
  readonly name = "EnvelopeEncryptionError"
}

export function createBlindIndex(masterKey: Buffer | undefined, value: string): string {
  const key = validateMasterKey(masterKey)
  return createHmac("sha256", key).update(value, "utf8").digest("base64url")
}

function encodeMetadata(metadata: EnvelopeMetadata): Buffer {
  return Buffer.from(JSON.stringify(metadata), "utf8")
}

function decodeBase64(value: string, field: string): Buffer {
  const decoded = Buffer.from(value, "base64")
  if (decoded.length === 0) throw new EnvelopeEncryptionError(`invalid encrypted ${field}`)
  return decoded
}

function validateMasterKey(masterKey: Buffer | undefined): Buffer {
  if (!masterKey || masterKey.length !== KEY_BYTES) {
    throw new EnvelopeEncryptionError("encryption master key is missing or invalid")
  }
  return masterKey
}

export function createEnvelopeCipher(masterKey: Buffer | undefined) {
  const key = validateMasterKey(masterKey)
  return {
    encrypt(plaintext: string, metadata: EnvelopeMetadata): EncryptedEnvelope {
      const parsedMetadata = metadataSchema.parse(metadata)
      const nonce = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, key, nonce)
      cipher.setAAD(encodeMetadata(parsedMetadata))
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
      return {
        version: ENVELOPE_VERSION,
        algorithm: ALGORITHM,
        nonce: nonce.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
      }
    },
    decrypt(envelope: EncryptedEnvelope, metadata: EnvelopeMetadata): string {
      try {
        const parsedEnvelope = envelopeSchema.parse(envelope)
        const parsedMetadata = metadataSchema.parse(metadata)
        const nonce = decodeBase64(parsedEnvelope.nonce, "nonce")
        const ciphertext = decodeBase64(parsedEnvelope.ciphertext, "ciphertext")
        const authTag = decodeBase64(parsedEnvelope.authTag, "authentication tag")
        if (nonce.length !== IV_BYTES || authTag.length !== 16) {
          throw new EnvelopeEncryptionError("invalid encrypted envelope")
        }
        const decipher = createDecipheriv(ALGORITHM, key, nonce)
        decipher.setAAD(encodeMetadata(parsedMetadata))
        decipher.setAuthTag(authTag)
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
      } catch (error) {
        if (error instanceof EnvelopeEncryptionError) throw error
        throw new EnvelopeEncryptionError("encrypted value failed authentication")
      }
    },
  }
}
