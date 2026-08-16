import { describe, expect, it } from "vitest"

import {
  createSchedulerService,
  type DispatchResult,
  type SchedulerJob,
} from "../apps/api/src/scheduler"
import { createWahaClient } from "../apps/api/src/waha/adapter"

describe("Todo 10 scheduler and WAHA baseline", () => {
  it("preserves one-claim/one-transport behavior for an already due job", async () => {
    // Given the scheduler's pre-Todo-10 lease contract
    const job: SchedulerJob = {
      id: "baseline-job",
      sessionId: "baseline-session",
      accountScope: "personal",
      recipientPhone: "+15550000001",
      message: "baseline",
      scheduledFor: new Date("2030-01-01T00:00:00.000Z"),
      timezone: "UTC",
      idempotencyKey: "baseline-idempotency",
      state: "scheduled",
      attempts: 0,
      nextAttemptAt: new Date("2030-01-01T00:00:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      recoveryCode: null,
      failureCode: null,
    }
    let current = job
    let claims = 0
    let transports = 0
    const repository = {
      create: async (input: SchedulerJob) => input,
      find: async () => current,
      claimDue: async (owner: string, now: Date, leaseMs: number) => {
        if (claims > 0 || current.state !== "scheduled" || current.scheduledFor > now) return null
        claims += 1
        current = {
          ...current,
          state: "attempting",
          attempts: 1,
          leaseOwner: owner,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        }
        return current
      },
      complete: async (
        _id: string,
        _owner: string,
        result: Extract<DispatchResult, { state: "submitted" | "acknowledged" }>,
      ) => {
        current = { ...current, state: result.state, providerMessageId: result.providerMessageId }
        return current
      },
      fail: async () => current,
      cancel: async () => null,
      edit: async () => null,
      recoverExpiredLeases: async () => 0,
    }
    const service = createSchedulerService({
      repository,
      transport: async () => {
        transports += 1
        return { state: "submitted", providerMessageId: "baseline-provider" }
      },
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    })

    // When two workers process the same due job
    await Promise.all([service.runOnce("worker-a"), service.runOnce("worker-b")])

    // Then the pre-existing contract dispatches exactly once and records submission
    expect(claims).toBe(1)
    expect(transports).toBe(1)
    expect(current).toMatchObject({ state: "submitted", providerMessageId: "baseline-provider" })
  })

  it("keeps the pre-existing WAHA adapter server-only at its boundary", () => {
    // Given the current adapter construction contract
    const client = createWahaClient({
      baseUrl: "https://waha.example.invalid",
      apiKey: "server-only-key",
    })

    // Then the client exposes no browser-facing credential projection
    expect(JSON.stringify(client)).not.toContain("server-only-key")
  })
})
