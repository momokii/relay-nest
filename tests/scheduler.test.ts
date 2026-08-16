import { describe, expect, it } from "vitest"

import {
  classifyWahaDispatchError,
  createSchedulerService,
  type DispatchResult,
  evaluateSafetyGates,
  type SchedulerJob,
  type SchedulerRepository,
  validateOneTimeSchedule,
} from "../apps/api/src/scheduler"
import { WahaHttpError } from "../apps/api/src/waha/errors"

const baseJob = (overrides: Partial<SchedulerJob> = {}): SchedulerJob => ({
  id: "job-1",
  sessionId: "session-1",
  accountScope: "personal",
  recipientPhone: "+15550000001",
  message: "hello",
  scheduledFor: new Date("2030-01-01T12:00:00.000Z"),
  timezone: "UTC",
  idempotencyKey: "idem-1",
  state: "scheduled",
  attempts: 0,
  nextAttemptAt: new Date("2030-01-01T12:00:00.000Z"),
  leaseOwner: null,
  leaseExpiresAt: null,
  recoveryCode: null,
  failureCode: null,
  ...overrides,
})

function repository(initial: SchedulerJob): SchedulerRepository {
  let job = initial
  let claimed = false
  return {
    create: async (input) => {
      job = { ...initial, ...input, id: initial.id }
      return job
    },
    find: async () => job,
    claimDue: async (owner, now, leaseMs) => {
      if (
        claimed ||
        (job.state !== "scheduled" && job.state !== "queued") ||
        job.scheduledFor > now
      )
        return null
      claimed = true
      job = {
        ...job,
        state: "attempting",
        attempts: job.attempts + 1,
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      }
      return job
    },
    complete: async (jobId, owner, result) => {
      if (job.id !== jobId || job.leaseOwner !== owner) return null
      job = {
        ...job,
        state: result.state,
        providerMessageId: result.providerMessageId ?? null,
        leaseOwner: null,
        leaseExpiresAt: null,
      }
      return job
    },
    fail: async (jobId, owner, failure) => {
      if (job.id !== jobId || job.leaseOwner !== owner) return null
      job = {
        ...job,
        state: failure.state,
        nextAttemptAt: failure.nextAttemptAt,
        recoveryCode: failure.recoveryCode,
        failureCode: failure.failureCode,
        leaseOwner: null,
        leaseExpiresAt: null,
      }
      return job
    },
    cancel: async () => {
      if (job.state !== "scheduled" && job.state !== "queued") return null
      job = { ...job, state: "cancelled" }
      return job
    },
    edit: async (_jobId, _scope, input) => {
      if (job.state !== "scheduled" && job.state !== "queued") return null
      job = { ...job, ...input }
      return job
    },
    recoverExpiredLeases: async (now) => {
      if (job.leaseExpiresAt && job.leaseExpiresAt <= now && job.state === "attempting") {
        job = {
          ...job,
          state: "unknown",
          recoveryCode: "lease_expired",
          leaseOwner: null,
          leaseExpiresAt: null,
        }
        return 1
      }
      return 0
    },
  }
}

describe("durable one-time scheduler", () => {
  it("dispatches a due job once when two workers claim concurrently", async () => {
    // Given one due job and two workers sharing the same repository
    const now = new Date("2030-01-01T12:00:00.000Z")
    const shared = repository(baseJob())
    const sent: string[] = []
    const transport = async (job: SchedulerJob): Promise<DispatchResult> => {
      sent.push(job.idempotencyKey)
      return { state: "submitted", providerMessageId: "provider-1" }
    }
    const first = createSchedulerService({ repository: shared, transport, now: () => now })
    const second = createSchedulerService({ repository: shared, transport, now: () => now })

    // When both workers process at the same instant
    await Promise.all([first.runOnce("worker-a"), second.runOnce("worker-b")])

    // Then exactly one provider submission and one durable provider id exist
    expect(sent).toEqual(["idem-1"])
    await expect(shared.find("job-1", "personal")).resolves.toMatchObject({
      state: "submitted",
      providerMessageId: "provider-1",
    })
  })

  it("keeps ambiguous provider failures visible and retries only within the bound", async () => {
    // Given a due job whose provider times out after accepting the request
    const now = new Date("2030-01-01T12:00:00.000Z")
    const shared = repository(baseJob())
    const service = createSchedulerService({
      repository: shared,
      transport: async (): Promise<DispatchResult> => ({
        state: "unknown",
        failureCode: "timeout",
        recoveryCode: "provider_timeout",
      }),
      now: () => now,
      maxAttempts: 1,
    })

    // When the worker handles the ambiguous result
    await service.runOnce("worker-a")

    // Then it is unknown and cannot be silently retried as a duplicate
    await expect(shared.find("job-1", "personal")).resolves.toMatchObject({
      state: "unknown",
      recoveryCode: "provider_timeout",
      attempts: 1,
    })
  })

  it("blocks dispatch when a safety gate fails and preserves the precise reason", async () => {
    // Given a due job and a timelock gate
    const now = new Date("2030-01-01T12:00:00.000Z")
    const shared = repository(baseJob())
    let sends = 0
    const service = createSchedulerService({
      repository: shared,
      transport: async (): Promise<DispatchResult> => {
        sends += 1
        return { state: "submitted", providerMessageId: "provider-1" }
      },
      gate: async () => ({ allowed: false, recoveryCode: "timelock_active" }),
      now: () => now,
    })

    // When the worker evaluates the job
    await service.runOnce("worker-a")

    // Then no WAHA call occurs and the recovery state is explicit
    expect(sends).toBe(0)
    await expect(shared.find("job-1", "personal")).resolves.toMatchObject({
      state: "failed",
      recoveryCode: "timelock_active",
    })
  })

  it("turns an expired lease into visible unknown recovery on restart", async () => {
    // Given a worker lease that expired while it was interrupted
    const now = new Date("2030-01-01T12:00:00.000Z")
    const shared = repository(
      baseJob({
        state: "attempting",
        attempts: 1,
        leaseOwner: "dead-worker",
        leaseExpiresAt: new Date("2030-01-01T11:59:00.000Z"),
      }),
    )

    // When a replacement worker performs restart recovery
    await expect(shared.recoverExpiredLeases(now)).resolves.toBe(1)

    // Then the job is not re-dispatched without human-visible recovery
    await expect(shared.find("job-1", "personal")).resolves.toMatchObject({
      state: "unknown",
      recoveryCode: "lease_expired",
    })
  })

  it("retries a bounded transient failure with exponential delay", async () => {
    // Given a retryable provider failure on the first attempt
    const now = new Date("2030-01-01T12:00:00.000Z")
    const shared = repository(baseJob())
    const service = createSchedulerService({
      repository: shared,
      transport: async (): Promise<DispatchResult> => ({
        state: "failed",
        failureCode: "network",
        recoveryCode: "provider_unavailable",
        retryable: true,
      }),
      now: () => now,
      backoffMs: 10_000,
      maxAttempts: 3,
    })

    // When the worker settles the first attempt
    await service.runOnce("worker-a")

    // Then the job is queued for a bounded retry rather than marked successful
    await expect(shared.find("job-1", "personal")).resolves.toMatchObject({
      state: "queued",
      nextAttemptAt: new Date("2030-01-01T12:00:10.000Z"),
    })
  })

  it("rejects cancellation after a worker has claimed the job", async () => {
    // Given a job already claimed by a worker
    const now = new Date("2030-01-01T12:00:00.000Z")
    const shared = repository(baseJob())
    await shared.claimDue("worker-a", now, 30_000)
    const service = createSchedulerService({
      repository: shared,
      transport: async (): Promise<DispatchResult> => ({
        state: "submitted",
        providerMessageId: "provider-1",
      }),
      now: () => now,
    })

    // When cancellation races with the claimed dispatch
    const cancelled = await service.cancel("job-1", "personal")

    // Then cancellation has no effect and the lease remains authoritative
    expect(cancelled).toBeNull()
    await expect(shared.find("job-1", "personal")).resolves.toMatchObject({
      state: "attempting",
      leaseOwner: "worker-a",
    })
  })

  it("requires an explicit timezone and classifies WAHA safety failures", () => {
    // Given an invalid timezone and provider responses from the locked WAHA contract
    expect(() =>
      validateOneTimeSchedule({ scheduledFor: new Date(), timezone: "Not/AZone" }),
    ).toThrow("valid IANA timezone")
    const cap = classifyWahaDispatchError(new WahaHttpError(463, "/api/send", "capping"))
    const lock = classifyWahaDispatchError(new WahaHttpError(475, "/api/send", "timelock"))

    // Then malformed schedules fail closed and 463/475 never become retries
    expect(cap).toMatchObject({ state: "failed", recoveryCode: "session_capped" })
    expect(lock).toMatchObject({ state: "failed", recoveryCode: "timelock_active" })
    expect(
      evaluateSafetyGates({
        consentGranted: false,
        sessionConnected: true,
        timelockLocked: false,
        cappingRemaining: 2,
        newlyLinkedCooldown: false,
      }),
    ).toEqual({ allowed: false, recoveryCode: "consent_required" })
  })
})
