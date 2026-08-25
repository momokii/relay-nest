import type { createDatabase } from "../../apps/api/src/db/client"
import type { createRepositories } from "../../apps/api/src/db/repositories"

type SeedScheduleStatesInput = Readonly<{
  repositories: ReturnType<typeof createRepositories>
  database: ReturnType<typeof createDatabase>
  sessionId: string
  accountScope: "personal"
}>

export async function seedScheduleStates(input: SeedScheduleStatesInput): Promise<void> {
  const terminal = await createOpaqueSchedule(input, "2099-12-30T00:00:00.000Z", "terminal")
  await input.database.sql`
    UPDATE scheduled_jobs
    SET state = 'submitted', updated_at = ${new Date(Date.now() - 60_000).toISOString()}
    WHERE id = ${terminal.id}
  `
  const recovery = await createOpaqueSchedule(input, "2099-12-31T00:00:00.000Z", "recovery")
  await input.database.sql`
    UPDATE scheduled_jobs
    SET state = 'unknown', recovery_code = 'lease_expired'
    WHERE id = ${recovery.id}
  `
}

async function createOpaqueSchedule(
  input: SeedScheduleStatesInput,
  scheduledFor: string,
  label: string,
): Promise<{ readonly id: string }> {
  return input.repositories.scheduledJobs.create({
    sessionId: input.sessionId,
    accountScope: input.accountScope,
    recipientPhoneCiphertext: "opaque",
    recipientPhoneNonce: "opaque",
    recipientPhoneAuthTag: "opaque",
    messageCiphertext: "opaque",
    messageNonce: "opaque",
    messageAuthTag: "opaque",
    scheduledFor: new Date(scheduledFor),
    timezone: "UTC",
    idempotencyKey: `e2e-${label}-schedule-${crypto.randomUUID()}`,
  })
}
