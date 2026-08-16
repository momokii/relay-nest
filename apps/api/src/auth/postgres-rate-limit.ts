import { and, eq, isNull, lt, or, sql } from "drizzle-orm"

import type { PersistenceDatabase } from "../db/client"
import { authRateLimits } from "../db/schema"

const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000
const BLOCK_MS = 15 * 60 * 1000
const MAX_RETAINED_ENTRIES = 10_000

export type RateLimitDecision = {
  readonly allowed: boolean
  readonly retryAfterSeconds: number
}

export class PostgresLoginRateLimiter {
  constructor(
    private readonly db: PersistenceDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(key: string): Promise<RateLimitDecision> {
    const now = this.now()
    return this.db.transaction(async (transaction) => {
      await this.lockKey(transaction, key)
      await this.removeExpired(transaction, now)
      await this.enforceRetentionLimit(transaction)
      const [entry] = await transaction
        .select()
        .from(authRateLimits)
        .where(eq(authRateLimits.key, key))
        .limit(1)
      return decisionFor(entry, now)
    })
  }

  async recordFailure(key: string): Promise<RateLimitDecision> {
    const now = this.now()
    return this.db.transaction(async (transaction) => {
      await this.lockKey(transaction, key)
      await this.removeExpired(transaction, now)
      const [entry] = await transaction
        .select()
        .from(authRateLimits)
        .where(eq(authRateLimits.key, key))
        .limit(1)
      if (entry && entry.windowStartedAt.getTime() + WINDOW_MS > now.getTime()) {
        if (entry.blockedUntil && entry.blockedUntil > now) return decisionFor(entry, now)
        const failures = entry.failures + 1
        const blockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + BLOCK_MS) : null
        const [updated] = await transaction
          .update(authRateLimits)
          .set({ failures, blockedUntil, active: true })
          .where(eq(authRateLimits.id, entry.id))
          .returning()
        await this.enforceRetentionLimit(transaction)
        return decisionFor(updated, now)
      }
      const [created] = await transaction
        .insert(authRateLimits)
        .values({ key, failures: 1, windowStartedAt: now, blockedUntil: null, active: true })
        .onConflictDoUpdate({
          target: authRateLimits.key,
          set: { failures: 1, windowStartedAt: now, blockedUntil: null, active: true },
        })
        .returning()
      await this.enforceRetentionLimit(transaction)
      return decisionFor(created, now)
    })
  }

  async clear(key: string): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await this.lockKey(transaction, key)
      await transaction.delete(authRateLimits).where(eq(authRateLimits.key, key))
    })
  }

  private async lockKey(
    transaction: Parameters<PersistenceDatabase["transaction"]>[0] extends (
      arg: infer T,
    ) => Promise<unknown>
      ? T
      : never,
    key: string,
  ): Promise<void> {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
  }

  private async removeExpired(
    transaction: Parameters<PersistenceDatabase["transaction"]>[0] extends (
      arg: infer T,
    ) => Promise<unknown>
      ? T
      : never,
    now: Date,
  ): Promise<void> {
    const cutoff = new Date(now.getTime() - WINDOW_MS)
    await transaction
      .delete(authRateLimits)
      .where(
        and(
          lt(authRateLimits.windowStartedAt, cutoff),
          or(isNull(authRateLimits.blockedUntil), lt(authRateLimits.blockedUntil, now)),
        ),
      )
  }

  private async enforceRetentionLimit(
    transaction: Parameters<PersistenceDatabase["transaction"]>[0] extends (
      arg: infer T,
    ) => Promise<unknown>
      ? T
      : never,
  ): Promise<void> {
    await transaction.execute(sql`
      delete from auth_rate_limits
      where id in (
        select id from auth_rate_limits
        order by window_started_at asc
        offset ${MAX_RETAINED_ENTRIES}
      )
    `)
  }
}

function decisionFor(
  entry: typeof authRateLimits.$inferSelect | undefined,
  now: Date,
): RateLimitDecision {
  if (!entry?.blockedUntil || entry.blockedUntil <= now)
    return { allowed: true, retryAfterSeconds: 0 }
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((entry.blockedUntil.getTime() - now.getTime()) / 1000),
  }
}
