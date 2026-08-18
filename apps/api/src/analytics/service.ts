import type { AuthPrincipal } from "../auth/service"
import type { AccountScope } from "../db/schema/shared"
import { projectAnalytics } from "./projection"
import type { AnalyticsProjection, AnalyticsSource, AnalyticsWindow } from "./types"

export class AnalyticsAuthorizationError extends Error {
  readonly name = "AnalyticsAuthorizationError"
  readonly code = "forbidden" as const
}

export type AnalyticsAuthorization = (
  principal: AuthPrincipal,
  sessionId: string,
  scope: AccountScope,
) => Promise<{ readonly allowed: boolean }>

export function createAnalyticsService(options: {
  readonly source: AnalyticsSource
  readonly authorize: AnalyticsAuthorization
}) {
  async function read(
    principal: AuthPrincipal,
    scope: AccountScope,
    window: AnalyticsWindow,
    sessionId?: string,
  ): Promise<AnalyticsProjection> {
    const sessions = await options.source.listSessions(scope)
    const candidates = sessionId ? sessions.filter((session) => session.id === sessionId) : sessions
    const visibleSessions = []
    for (const session of candidates) {
      const decision = await options.authorize(principal, session.id, scope)
      if (sessionId && !decision.allowed) throw new AnalyticsAuthorizationError()
      if (decision.allowed) visibleSessions.push(session)
    }
    if (sessionId && !visibleSessions.some((session) => session.id === sessionId))
      throw new AnalyticsAuthorizationError()
    const source = await options.source.read(
      scope,
      window,
      visibleSessions.map((session) => session.id),
    )
    return projectAnalytics({ ...source, scope, window, sessions: visibleSessions })
  }

  return { read }
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>
