import type { SchedulerJob } from "./types"

export type SchedulerTickerSource = {
  readonly runOnce: (owner: string) => Promise<SchedulerJob | null>
  readonly recover: (nowOverride?: Date) => Promise<number>
}

export type SchedulerTickerOptions = {
  readonly intervalMs?: number
  readonly maxJobsPerTick?: number
  readonly owner?: string
  readonly logger?: Pick<Console, "info" | "error">
}

export type SchedulerTicker = {
  readonly tick: () => Promise<number>
  readonly start: () => void
  readonly stop: () => void
}

const DEFAULT_INTERVAL_MS = 15_000
const DEFAULT_MAX_JOBS_PER_TICK = 25

export function createSchedulerTicker(
  scheduler: SchedulerTickerSource,
  options: SchedulerTickerOptions = {},
): SchedulerTicker {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const maxJobsPerTick = options.maxJobsPerTick ?? DEFAULT_MAX_JOBS_PER_TICK
  const owner = options.owner ?? `scheduler-ticker-${process.pid}`
  const logger = options.logger ?? console
  let running = false
  let timer: ReturnType<typeof setInterval> | null = null

  const tick = async (): Promise<number> => {
    if (running) return 0
    running = true
    let dispatched = 0
    try {
      const recovered = await scheduler.recover()
      if (recovered > 0) {
        logger.info(`scheduler ticker recovered ${recovered} expired/missed job(s)`)
      }
      for (; dispatched < maxJobsPerTick; dispatched += 1) {
        const job = await scheduler.runOnce(owner)
        if (!job) break
        logger.info(
          `scheduler ticker dispatched job ${job.id} (${job.idempotencyKey}) -> ${job.state}`,
        )
      }
    } catch (error) {
      logger.error(
        `scheduler ticker tick failed after ${dispatched} dispatch(es): ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      )
    } finally {
      running = false
    }
    return dispatched
  }

  return {
    tick,
    start: (): void => {
      if (timer !== null) return
      timer = setInterval(() => {
        void tick()
      }, intervalMs)
    },
    stop: (): void => {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    },
  }
}
