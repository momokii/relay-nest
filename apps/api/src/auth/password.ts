import { scrypt as nodeScrypt, randomBytes, timingSafeEqual } from "node:crypto"

const KEY_BYTES = 64
const SALT_BYTES = 16
const HASH_PREFIX = "scrypt"

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("base64url")
  const derived = await deriveKey(password, salt)
  return `$${HASH_PREFIX}$${salt}$${derived.toString("base64url")}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$")
  const algorithm = parts[1]
  const salt = parts[2]
  const expectedText = parts[3]
  if (algorithm !== HASH_PREFIX || !salt || !expectedText) return false
  const expected = Buffer.from(expectedText, "base64url")
  if (expected.length !== KEY_BYTES) return false
  const actual = await deriveKey(password, salt)
  return timingSafeEqual(actual, expected)
}

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, KEY_BYTES, (error, key) => {
      if (error) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
}
