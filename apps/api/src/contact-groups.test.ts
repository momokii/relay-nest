import { afterAll, describe, expect, it } from "vitest"

import { createDatabase } from "./db/client"
import { createContactGroupRepository } from "./db/repositories/contact-groups"

// biome-ignore lint/complexity/useLiteralKeys: required by exactOptionalPropertyTypes for ProcessEnv.
const databaseUrl = process.env["DATABASE_URL"]
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const key = Buffer.alloc(32, 7)
const repository = database ? createContactGroupRepository(database.db, key) : undefined

describe.skipIf(!repository || !database)("contact group repository", () => {
  it("shows Personal groups only to their creator in the requested scope", async () => {
    if (!repository || !database) return
    const userId = crypto.randomUUID()
    await database.sql`INSERT INTO users (id, email, password_hash, display_name) VALUES (${userId}, ${`${userId}@example.test`}, 'test', 'Test')`
    await repository.create({ userId, accountScope: "personal", name: `Personal ${userId}` })

    await expect(repository.list(userId, "personal")).resolves.toHaveLength(1)
    await expect(repository.list(userId, "business")).resolves.toHaveLength(0)
    await database.sql`DELETE FROM users WHERE id = ${userId}`
  })

  it("adds and removes scoped encrypted phone members", async () => {
    if (!repository || !database) return
    const userId = crypto.randomUUID()
    await database.sql`INSERT INTO users (id, email, password_hash, display_name) VALUES (${userId}, ${`${userId}@example.test`}, 'test', 'Test')`
    const group = await repository.create({
      userId,
      accountScope: "personal",
      name: `Group ${userId}`,
    })
    if (!group) throw new Error("group was not created")
    const first = await repository.addMember(userId, "personal", group.id, {
      phone: "+14155550101",
    })
    await repository.addMember(userId, "personal", group.id, { phone: "+14155550102" })

    await expect(repository.listMembers(userId, "personal", group.id)).resolves.toHaveLength(2)
    await expect(
      repository.addMember(userId, "business", group.id, { phone: "+14155550103" }),
    ).rejects.toThrow()
    await expect(
      repository.addMember(userId, "personal", group.id, { phone: "+14155550101" }),
    ).rejects.toThrow()
    await expect(repository.removeMember(userId, "personal", group.id, first.id)).resolves.toBe(
      true,
    )
    await expect(repository.listMembers(userId, "personal", group.id)).resolves.toHaveLength(1)
    await database.sql`DELETE FROM users WHERE id = ${userId}`
  })

  it("rejects decrypting a member with the wrong key", async () => {
    if (!repository || !database) return
    const userId = crypto.randomUUID()
    await database.sql`INSERT INTO users (id, email, password_hash, display_name) VALUES (${userId}, ${`${userId}@example.test`}, 'test', 'Test')`
    const group = await repository.create({
      userId,
      accountScope: "personal",
      name: `Wrong key ${userId}`,
    })
    if (!group) throw new Error("group was not created")
    await repository.addMember(userId, "personal", group.id, { phone: "+14155550103" })
    const wrongKeyRepository = createContactGroupRepository(database.db, Buffer.alloc(32, 8))

    await expect(wrongKeyRepository.listMembers(userId, "personal", group.id)).rejects.toThrow()
    await database.sql`DELETE FROM users WHERE id = ${userId}`
  })
})

afterAll(async () => {
  await database?.close()
})
