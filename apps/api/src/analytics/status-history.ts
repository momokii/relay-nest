import type {
  AnalyticsInput,
  AnalyticsSession,
  AnalyticsStatusEntry,
  AnalyticsWindow,
} from "./types"

export function statusHistory(
  input: AnalyticsInput,
  session: AnalyticsSession,
): readonly AnalyticsStatusEntry[] {
  return [...input.statusHistory]
    .filter(
      (entry) =>
        entry.accountScope === input.scope &&
        entry.sessionId === session.id &&
        entry.observedAt < input.window.to,
    )
    .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime())
}

export function uptimeMs(
  entries: readonly AnalyticsStatusEntry[],
  window: AnalyticsWindow,
): number | null {
  let total = 0
  for (const [index, entry] of entries.entries()) {
    if (!activeStatuses.has(entry.status)) continue
    const next = entries[index + 1]
    const start = Math.max(entry.observedAt.getTime(), window.from.getTime())
    const end = Math.min(next?.observedAt.getTime() ?? window.to.getTime(), window.to.getTime())
    total += Math.max(0, end - start)
    if (!next) return null
  }
  return total
}

const activeStatuses = new Set(["WORKING", "CONNECTED", "READY"])
