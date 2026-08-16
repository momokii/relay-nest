import { createBlindIndex, createEnvelopeCipher } from "@waha-command-center/config"
import { and, eq } from "drizzle-orm"

import type { MessagingContact } from "../../messaging"
import type { PersistenceDatabase } from "../client"
import { withPersistenceErrors } from "../repository-support"
import { contacts, sessionMessagingSafety } from "../schema"
import type { AccountScope } from "../schema/shared"

function decryptOptional(
  cipher: ReturnType<typeof createEnvelopeCipher>,
  ciphertext: string | null,
  nonce: string | null,
  authTag: string | null,
  accountScope: AccountScope,
): string | null {
  if (!ciphertext || !nonce || !authTag) return null
  return cipher.decrypt(
    { version: 1, algorithm: "aes-256-gcm", ciphertext, nonce, authTag },
    { accountScope },
  )
}

export function createMessagingRepositories(
  db: PersistenceDatabase,
  masterKey: Buffer | undefined,
) {
  const cipher = createEnvelopeCipher(masterKey)
  const decode = (
    row: typeof contacts.$inferSelect,
    accountScope: AccountScope,
  ): MessagingContact => ({
    id: row.id,
    phone: cipher.decrypt(
      {
        version: 1,
        algorithm: "aes-256-gcm",
        ciphertext: row.phoneCiphertext,
        nonce: row.phoneNonce,
        authTag: row.phoneAuthTag,
      },
      { accountScope },
    ),
    providerChatId: cipher.decrypt(
      {
        version: 1,
        algorithm: "aes-256-gcm",
        ciphertext: row.providerChatIdCiphertext,
        nonce: row.providerChatIdNonce,
        authTag: row.providerChatIdAuthTag,
      },
      { accountScope },
    ),
    displayName: decryptOptional(
      cipher,
      row.displayNameCiphertext,
      row.displayNameNonce,
      row.displayNameAuthTag,
      accountScope,
    ),
    consentGranted: row.consentGranted,
    optedOut: row.optedOut,
  })

  return {
    contacts: {
      find: async (accountScope: AccountScope, phone: string) => {
        const [row] = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.accountScope, accountScope),
              eq(contacts.phoneBlindIndex, createBlindIndex(masterKey, phone)),
            ),
          )
          .limit(1)
        return row ? decode(row, accountScope) : null
      },
      findById: async (accountScope: AccountScope, id: string) => {
        const [row] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.accountScope, accountScope), eq(contacts.id, id)))
          .limit(1)
        return row ? decode(row, accountScope) : null
      },
      save: (input: MessagingContact) => {
        if (!input.accountScope || !input.sessionId)
          throw new Error("messaging contact persistence requires scope and session")
        const accountScope = input.accountScope
        const sessionId = input.sessionId
        const phone = cipher.encrypt(input.phone, { accountScope })
        const chat = cipher.encrypt(input.providerChatId, { accountScope })
        const display = input.displayName
          ? cipher.encrypt(input.displayName, { accountScope })
          : null
        return withPersistenceErrors(
          db
            .insert(contacts)
            .values({
              id: input.id,
              sessionId,
              accountScope,
              phoneCiphertext: phone.ciphertext,
              phoneNonce: phone.nonce,
              phoneAuthTag: phone.authTag,
              phoneBlindIndex: createBlindIndex(masterKey, input.phone),
              providerChatIdCiphertext: chat.ciphertext,
              providerChatIdNonce: chat.nonce,
              providerChatIdAuthTag: chat.authTag,
              displayNameCiphertext: display?.ciphertext ?? null,
              displayNameNonce: display?.nonce ?? null,
              displayNameAuthTag: display?.authTag ?? null,
              consentGranted: input.consentGranted,
              optedOut: input.optedOut,
              consentUpdatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [contacts.accountScope, contacts.phoneBlindIndex],
              set: {
                providerChatIdCiphertext: chat.ciphertext,
                providerChatIdNonce: chat.nonce,
                providerChatIdAuthTag: chat.authTag,
                updatedAt: new Date(),
              },
            })
            .returning()
            .then(([row]) => {
              if (!row) throw new Error("contact persistence returned no row")
              return decode(row, accountScope)
            }),
        )
      },
      updateConsent: async (
        accountScope: AccountScope,
        id: string,
        consentGranted: boolean,
        optedOut: boolean,
      ) => {
        const [row] = await db
          .update(contacts)
          .set({ consentGranted, optedOut, consentUpdatedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(contacts.accountScope, accountScope), eq(contacts.id, id)))
          .returning()
        return row ? decode(row, accountScope) : null
      },
    },
    safety: {
      find: async (sessionId: string, accountScope: AccountScope) => {
        const [row] = await db
          .select()
          .from(sessionMessagingSafety)
          .where(
            and(
              eq(sessionMessagingSafety.sessionId, sessionId),
              eq(sessionMessagingSafety.accountScope, accountScope),
            ),
          )
          .limit(1)
        return row ?? null
      },
    },
  }
}
