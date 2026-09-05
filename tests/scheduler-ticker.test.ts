import { describe, expect, it, vi } from "vitest"

import {
  createSchedulerTicker,
  type SchedulerJob,
  type SchedulerTickerSource,
} from "../apps/api/src/scheduler"

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

type FakeScheduler = SchedulerTickerSource & {
  readonly queue: readonly SchedulerJob[]
  readonly owners: readonly string[]
  readonly recoverCalls: number
}

function createFakeScheduler(
  jobs: readonly SchedulerJob[] = [],
  recoveredPerCall = 0,
): FakeScheduler {
  const queue = [...jobs]
  const owners: string[] = []
  let recoverCalls = 0
  return {
    queue,
    owners,
    get recoverCalls(): number {
      return recoverCalls
    },
    runOnce: async (owner) => {
      owners.push(owner)
      const job = queue.shift()
      return job ?? null
    },
    recover: async () => {
      recoverCalls += 1
      return recoveredPerCall
    },
  }
}

function createCaptureLogger() {
  const infos: string[] = []
  const errors: string[] = []
  return {
    infos,
    errors,
    info: (message: string) => {
      infos.push(message)
    },
    error: (message: string) => {
      errors.push(message)
    },
  }
}

describe("scheduler ticker", () => {
  it("dispatches every due job until none remain", async () => {
    const scheduler = createFakeScheduler([
      baseJob({ id: "j1" }),
      baseJob({ id: "j2", idempotencyKey: "idem-2" }),
      baseJob({ id: "j3", idempotencyKey: "idem-3" }),
    ])
    const ticker = createSchedulerTicker(scheduler, { owner: "test-owner" })
    expect(await ticker.tick()).toBe(3)
    expect(await ticker.tick()).toBe(0)
    expect(scheduler.owners).toHaveLength(5)
    expect(scheduler.owners.every((owner) => owner === "test-owner")).toBe(true)
  })

  it("caps the number of jobs dispatched per tick", async () => {
    const scheduler = createFakeScheduler(
      [1, 2, 3, 4, 5].map((n) => baseJob({ id: `j${n}`, idempotencyKey: `idem-${n}` })),
    )
    const ticker = createSchedulerTicker(scheduler, { maxJobsPerTick: 2 })
    expect(await ticker.tick()).toBe(2)
    expect(await ticker.tick()).toBe(2)
    expect(await ticker.tick()).toBe(1)
    expect(await ticker.tick()).toBe(0)
  })

  it("runs recovery before dispatching and reports recovered jobs", async () => {
    const scheduler = createFakeScheduler([baseJob({ id: "j1" })], 2)
    const logger = createCaptureLogger()
    const ticker = createSchedulerTicker(scheduler, { logger })
    expect(await ticker.tick()).toBe(1)
    expect(scheduler.recoverCalls).toBe(1)
    expect(logger.infos.join("\n")).toContain("recovered 2")
  })

  it("survives scheduler failures and stays usable", async () => {
    let calls = 0
    const scheduler: SchedulerTickerSource = {
      runOnce: async () => {
        calls += 1
        throw new Error("boom")
      },
      recover: async () => 0,
    }
    const logger = createCaptureLogger()
    const ticker = createSchedulerTicker(scheduler, { logger })
    expect(await ticker.tick()).toBe(0)
    expect(logger.errors.join("\n")).toContain("boom")
    expect(await ticker.tick()).toBe(0)
    expect(calls).toBe(2)
  })

  it("ignores overlapping ticks while one is in flight", async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let claimed = 0
    const scheduler: SchedulerTickerSource = {
      runOnce: async () => {
        claimed += 1
        await gate
        return claimed === 1 ? baseJob({ id: "j1" }) : null
      },
      recover: async () => 0,
    }
    const ticker = createSchedulerTicker(scheduler)
    const first = ticker.tick()
    expect(await ticker.tick()).toBe(0)
    release?.()
    expect(await first).toBe(1)
  })

  it("start dispatches on the interval and stop cancels it", async () => {
    vi.useFakeTimers()
    try {
      const scheduler = createFakeScheduler([
        baseJob({ id: "j1" }),
        baseJob({ id: "j2", idempotencyKey: "idem-2" }),
      ])
      const ticker = createSchedulerTicker(scheduler, {
        intervalMs: 1_000,
        owner: "interval-owner",
      })
      ticker.start()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(scheduler.queue).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(scheduler.owners).toHaveLength(4)
      ticker.stop()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(scheduler.owners).toHaveLength(4)
      ticker.start()
      ticker.start()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(scheduler.owners).toHaveLength(5)
      expect(scheduler.owners.every((owner) => owner === "interval-owner")).toBe(true)
      ticker.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
