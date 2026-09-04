import { createBlindIndex, createEnvelopeCipher } from "@waha-command-center/config"
import { and, eq } from "drizzle-orm"

import type { ContactGroupMemberInput, ContactGroupRepository } from "../../contact-groups-types"
import type { PersistenceDatabase } from "../client"
import { RepositoryScopeError, withPersistenceErrors } from "../repository-support"
import { contactGroupMembers, contactGroups, contacts } from "../schema"
import type { AccountScope } from "../schema/shared"

export function createContactGroupRepository(
  db: PersistenceDatabase,
  masterKey: Buffer | undefined,
): ContactGroupRepository {
  const cipher = createEnvelopeCipher(masterKey)

  const hasGrant = async (userId: string, groupId: string, accountScope: AccountScope) => {
    const [group] = await db
      .select({ id: contactGroups.id })
      .from(contactGroups)
      .where(
        and(
          eq(contactGroups.id, groupId),
          eq(contactGroups.accountScope, accountScope),
          eq(contactGroups.createdBy, userId),
        ),
      )
      .limit(1)
    return Boolean(group)
  }

  const requireGrant = async (userId: string, groupId: string, accountScope: AccountScope) => {
    if (!(await hasGrant(userId, groupId, accountScope)))
      throw new RepositoryScopeError("contact group is not granted in this scope")
  }

  const hasMember = async (
    accountScope: AccountScope,
    sessionId: string,
    groupId: string,
    phone: string,
  ) => {
    const blindIndex = createBlindIndex(masterKey, phone)
    const [member] = await db
      .select({ id: contactGroupMembers.id })
      .from(contactGroupMembers)
      .leftJoin(contacts, eq(contactGroupMembers.contactId, contacts.id))
      .where(
        and(
          eq(contactGroupMembers.groupId, groupId),
          eq(contactGroupMembers.accountScope, accountScope),
          eq(contacts.sessionId, sessionId),
          eq(contacts.accountScope, accountScope),
          eq(contacts.phoneBlindIndex, blindIndex),
        ),
      )
      .limit(1)
    if (member) return true
    const [directMember] = await db
      .select({ id: contactGroupMembers.id })
      .from(contactGroupMembers)
      .where(
        and(
          eq(contactGroupMembers.groupId, groupId),
          eq(contactGroupMembers.accountScope, accountScope),
          eq(contactGroupMembers.phoneBlindIndex, blindIndex),
        ),
      )
      .limit(1)
    return Boolean(directMember)
  }

  const decode = (row: typeof contactGroupMembers.$inferSelect, accountScope: AccountScope) => ({
    id: row.id,
    groupId: row.groupId,
    contactId: row.contactId,
    phone:
      row.phoneCiphertext && row.phoneNonce && row.phoneAuthTag
        ? cipher.decrypt(
            {
              version: 1,
              algorithm: "aes-256-gcm",
              ciphertext: row.phoneCiphertext,
              nonce: row.phoneNonce,
              authTag: row.phoneAuthTag,
            },
            { accountScope },
          )
        : null,
    accountScope,
    createdAt: row.createdAt,
  })

  return {
    hasGrant,
    hasMember,
    create: (input: {
      readonly userId: string
      readonly accountScope: AccountScope
      readonly name: string
    }) =>
      withPersistenceErrors(
        db
          .insert(contactGroups)
          .values({ accountScope: input.accountScope, name: input.name, createdBy: input.userId })
          .returning()
          .then(([group]) => {
            if (!group) throw new Error("contact group persistence returned no row")
            return group
          }),
      ),
    list: (userId: string, accountScope: AccountScope) =>
      db
        .select()
        .from(contactGroups)
        .where(
          and(eq(contactGroups.createdBy, userId), eq(contactGroups.accountScope, accountScope)),
        ),
    addMember: async (
      userId: string,
      accountScope: AccountScope,
      groupId: string,
      input: ContactGroupMemberInput,
    ) => {
      await requireGrant(userId, groupId, accountScope)
      const member =
        "contactId" in input
          ? await (async () => {
              const [contact] = await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(
                  and(eq(contacts.id, input.contactId), eq(contacts.accountScope, accountScope)),
                )
                .limit(1)
              if (!contact) throw new RepositoryScopeError("contact is not in this scope")
              return { groupId, contactId: contact.id, accountScope }
            })()
          : (() => {
              const encrypted = cipher.encrypt(input.phone, { accountScope })
              return {
                groupId,
                accountScope,
                phoneCiphertext: encrypted.ciphertext,
                phoneNonce: encrypted.nonce,
                phoneAuthTag: encrypted.authTag,
                phoneBlindIndex: createBlindIndex(masterKey, input.phone),
              }
            })()
      return withPersistenceErrors(
        db
          .insert(contactGroupMembers)
          .values(member)
          .returning()
          .then(([row]) => {
            if (!row) throw new Error("contact group member persistence returned no row")
            return decode(row, accountScope)
          }),
      )
    },
    listMembers: async (userId: string, accountScope: AccountScope, groupId: string) => {
      await requireGrant(userId, groupId, accountScope)
      const rows = await db
        .select()
        .from(contactGroupMembers)
        .where(
          and(
            eq(contactGroupMembers.groupId, groupId),
            eq(contactGroupMembers.accountScope, accountScope),
          ),
        )
      return rows.map((row) => decode(row, accountScope))
    },
    removeMember: async (
      userId: string,
      accountScope: AccountScope,
      groupId: string,
      memberId: string,
    ) => {
      await requireGrant(userId, groupId, accountScope)
      const rows = await db
        .delete(contactGroupMembers)
        .where(
          and(
            eq(contactGroupMembers.id, memberId),
            eq(contactGroupMembers.groupId, groupId),
            eq(contactGroupMembers.accountScope, accountScope),
          ),
        )
        .returning({ id: contactGroupMembers.id })
      return rows.length === 1
    },
  }
}
