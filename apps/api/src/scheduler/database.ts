import {
  createBlindIndex,
  createEnvelopeCipher,
  type EncryptedEnvelope,
} from "@waha-command-center/config"

import type { createSchedulingRepositories } from "../db/repositories/scheduling"
import { DuplicateRecordError } from "../db/repository-support"
import type { AccountScope } from "../db/schema/shared"
import type { SchedulerJob, SchedulerRepository } from "./types"
import { type OneTimeSchedule, validateOneTimeSchedule } from "./validation"

type RawRepository = ReturnType<typeof createSchedulingRepositories>["scheduledJobs"]

export type EncryptedScheduleInput = OneTimeSchedule & {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly recipientPhone: string
  readonly message: string
  readonly idempotencyKey: string
}

export function createEncryptedSchedulerRepository(
  repository: RawRepository,
  masterKey: Buffer | undefined,
): SchedulerRepository & {
  readonly schedule: (input: EncryptedScheduleInput) => Promise<SchedulerJob>
  readonly scheduleWithIdempotency: (
    input: EncryptedScheduleInput,
  ) => Promise<{ readonly job: SchedulerJob; readonly duplicate: boolean }>
  readonly findByIdempotencyKey: (idempotencyKey: string) => Promise<{
    readonly jobId: string
    readonly state: SchedulerJob["state"]
    readonly providerMessageId?: string
    readonly recoveryCode?: string
  } | null>
} {
  const cipher = createEnvelopeCipher(masterKey)
  const envelope = (value: string, accountScope: AccountScope): EncryptedEnvelope =>
    cipher.encrypt(value, { accountScope })
  const decode = (
    job: Awaited<ReturnType<RawRepository["find"]>> | undefined,
  ): SchedulerJob | null => {
    if (!job) return null
    return {
      id: job.id,
      sessionId: job.sessionId,
      accountScope: job.accountScope,
      recipientPhone: cipher.decrypt(
        {
          version: 1,
          algorithm: "aes-256-gcm",
          ciphertext: job.recipientPhoneCiphertext,
          nonce: job.recipientPhoneNonce,
          authTag: job.recipientPhoneAuthTag,
        },
        { accountScope: job.accountScope },
      ),
      message: cipher.decrypt(
        {
          version: 1,
          algorithm: "aes-256-gcm",
          ciphertext: job.messageCiphertext,
          nonce: job.messageNonce,
          authTag: job.messageAuthTag,
        },
        { accountScope: job.accountScope },
      ),
      scheduledFor: job.scheduledFor,
      timezone: job.timezone,
      idempotencyKey: job.idempotencyKey,
      state: job.state,
      attempts: job.attempts,
      nextAttemptAt: job.nextAttemptAt,
      leaseOwner: job.leaseOwner,
      leaseExpiresAt: job.leaseExpiresAt,
      providerMessageId: job.providerMessageId,
      recoveryCode: job.recoveryCode,
      failureCode: job.failureCode,
    }
  }
  const createWithIdempotency = async (
    input: EncryptedScheduleInput,
  ): Promise<{ readonly job: SchedulerJob; readonly duplicate: boolean }> => {
    const schedule = validateOneTimeSchedule(input)
    const recipient = envelope(input.recipientPhone, input.accountScope)
    const message = envelope(input.message, input.accountScope)
    let job: Awaited<ReturnType<RawRepository["create"]>>
    try {
      job = await repository.create({
        sessionId: input.sessionId,
        accountScope: input.accountScope,
        recipientPhoneCiphertext: recipient.ciphertext,
        recipientPhoneNonce: recipient.nonce,
        recipientPhoneAuthTag: recipient.authTag,
        messageCiphertext: message.ciphertext,
        messageNonce: message.nonce,
        messageAuthTag: message.authTag,
        messageBlindIndex: createBlindIndex(masterKey, input.message),
        scheduledFor: schedule.scheduledFor,
        timezone: schedule.timezone,
        idempotencyKey: input.idempotencyKey,
        nextAttemptAt: schedule.scheduledFor,
      })
    } catch (error) {
      if (!(error instanceof DuplicateRecordError)) throw error
      const existing = await repository.findByIdempotencyKey(input.idempotencyKey)
      if (!existing) throw error
      const existingDecoded = decode(existing)
      if (!existingDecoded) throw error
      return { job: existingDecoded, duplicate: true }
    }
    const decoded = decode(job)
    if (!decoded) throw new Error("scheduler repository returned no job")
    return { job: decoded, duplicate: false }
  }
  const create = async (input: EncryptedScheduleInput): Promise<SchedulerJob> =>
    (await createWithIdempotency(input)).job
  return {
    create: async (input) => {
      const schedule = validateOneTimeSchedule(input)
      const recipient = envelope(input.recipientPhone, input.accountScope)
      const message = envelope(input.message, input.accountScope)
      const result = await repository.create({
        sessionId: input.sessionId,
        accountScope: input.accountScope,
        recipientPhoneCiphertext: recipient.ciphertext,
        recipientPhoneNonce: recipient.nonce,
        recipientPhoneAuthTag: recipient.authTag,
        messageCiphertext: message.ciphertext,
        messageNonce: message.nonce,
        messageAuthTag: message.authTag,
        messageBlindIndex: createBlindIndex(masterKey, input.message),
        scheduledFor: schedule.scheduledFor,
        timezone: schedule.timezone,
        idempotencyKey: input.idempotencyKey,
        state: input.state,
        attempts: input.attempts,
        nextAttemptAt: input.nextAttemptAt ?? schedule.scheduledFor,
      })
      const decoded = decode(result)
      if (!decoded) throw new Error("scheduler repository returned no job")
      return decoded
    },
    schedule: create,
    scheduleWithIdempotency: createWithIdempotency,
    findByIdempotencyKey: async (idempotencyKey: string) => {
      const job = await repository.findByIdempotencyKey(idempotencyKey)
      const decoded = decode(job)
      return decoded
        ? {
            jobId: decoded.id,
            state: decoded.state,
            ...(decoded.providerMessageId ? { providerMessageId: decoded.providerMessageId } : {}),
            ...(decoded.recoveryCode ? { recoveryCode: decoded.recoveryCode } : {}),
          }
        : null
    },
    find: async (id, scope) => decode(await repository.find(id, scope)),
    claimDue: async (owner, now, leaseMs) => decode(await repository.claimDue(owner, now, leaseMs)),
    complete: async (id, owner, result) => decode(await repository.complete(id, owner, result)),
    fail: async (id, owner, failure) => decode(await repository.fail(id, owner, failure)),
    cancel: async (id, scope) => decode(await repository.cancel(id, scope)),
    edit: async (id, scope, input) => {
      const recipient = envelope(input.recipientPhone, scope)
      const message = envelope(input.message, scope)
      return decode(
        await repository.edit(id, scope, {
          recipientPhoneCiphertext: recipient.ciphertext,
          recipientPhoneNonce: recipient.nonce,
          recipientPhoneAuthTag: recipient.authTag,
          messageCiphertext: message.ciphertext,
          messageNonce: message.nonce,
          messageAuthTag: message.authTag,
          scheduledFor: input.scheduledFor,
          timezone: input.timezone,
          nextAttemptAt: input.scheduledFor,
        }),
      )
    },
    recoverExpiredLeases: (now) => repository.recoverExpiredLeases(now),
    markMissed: (now, graceMs) =>
      repository.markMissed ? repository.markMissed(now, graceMs) : Promise.resolve(0),
  }
}
