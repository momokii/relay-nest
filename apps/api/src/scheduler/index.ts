import type { DispatchResult, SchedulerJob, SchedulerServiceOptions } from "./types"
import { validateOneTimeSchedule } from "./validation"

export {
  createEncryptedSchedulerRepository,
  type EncryptedScheduleInput,
} from "./database"
export { evaluateSafetyGates, type SafetyGateInput } from "./gates"
export {
  createSchedulerTicker,
  type SchedulerTicker,
  type SchedulerTickerOptions,
  type SchedulerTickerSource,
} from "./ticker"
export type {
  DispatchResult,
  SchedulerFailure,
  SchedulerGate,
  SchedulerJob,
  SchedulerRepository,
  SchedulerServiceOptions,
  SchedulerState,
} from "./types"
export { ScheduleValidationError, validateOneTimeSchedule } from "./validation"
export { classifyWahaDispatchError } from "./waha"

const DEFAULT_LEASE_MS = 30_000
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BACKOFF_MS = 5_000
const DEFAULT_MISSED_GRACE_MS = 60_000

export function createSchedulerService(options: SchedulerServiceOptions) {
  const now = options.now ?? (() => new Date())
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const missedGraceMs = options.missedGraceMs ?? DEFAULT_MISSED_GRACE_MS

  return {
    async runOnce(owner: string): Promise<SchedulerJob | null> {
      const current = now()
      const claimed = await options.repository.claimDue(owner, current, leaseMs)
      if (!claimed) return null
      const gate = options.gate ? await options.gate(claimed) : { allowed: true as const }
      if (!gate.allowed) {
        return options.repository.fail(claimed.id, owner, {
          state: "failed",
          failureCode: "safety_gate_blocked",
          recoveryCode: gate.recoveryCode,
          nextAttemptAt: null,
        })
      }
      const result = await options.transport(claimed)
      return settleResult(options.repository, claimed, owner, result, {
        now: current,
        maxAttempts,
        backoffMs,
      })
    },
    recover(nowOverride = now()): Promise<number> {
      return recoverRepository(options.repository, nowOverride, missedGraceMs)
    },
    cancel: (jobId: string, accountScope: SchedulerJob["accountScope"]) =>
      options.repository.cancel(jobId, accountScope),
    edit: async (
      jobId: string,
      accountScope: SchedulerJob["accountScope"],
      input: Pick<SchedulerJob, "scheduledFor" | "timezone" | "recipientPhone" | "message">,
    ) => {
      const schedule = validateOneTimeSchedule(input)
      return options.repository.edit(jobId, accountScope, { ...input, ...schedule })
    },
    validateSchedule: validateOneTimeSchedule,
  }
}

async function recoverRepository(
  repository: SchedulerServiceOptions["repository"],
  now: Date,
  missedGraceMs: number,
): Promise<number> {
  const expired = await repository.recoverExpiredLeases(now)
  const missed = repository.markMissed ? await repository.markMissed(now, missedGraceMs) : 0
  return expired + missed
}

type RetryOptions = {
  readonly now: Date
  readonly maxAttempts: number
  readonly backoffMs: number
}

async function settleResult(
  repository: SchedulerServiceOptions["repository"],
  job: SchedulerJob,
  owner: string,
  result: DispatchResult,
  retry: RetryOptions,
): Promise<SchedulerJob | null> {
  switch (result.state) {
    case "submitted":
    case "acknowledged":
      return repository.complete(job.id, owner, result)
    case "unknown":
      return repository.fail(job.id, owner, {
        state: "unknown",
        failureCode: result.failureCode,
        recoveryCode: result.recoveryCode,
        nextAttemptAt: null,
      })
    case "failed":
      if (result.retryable === true && job.attempts < retry.maxAttempts) {
        return repository.fail(job.id, owner, {
          state: "queued",
          failureCode: result.failureCode,
          recoveryCode: result.recoveryCode,
          nextAttemptAt: new Date(retry.now.getTime() + retry.backoffMs * 2 ** (job.attempts - 1)),
        })
      }
      return repository.fail(job.id, owner, {
        state: "failed",
        failureCode: result.failureCode,
        recoveryCode: result.recoveryCode,
        nextAttemptAt: null,
      })
    default:
      return assertNever(result)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected scheduler result: ${JSON.stringify(value)}`)
}
