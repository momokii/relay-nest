import type { FastifyInstance } from "fastify"
import { z } from "zod"

import type { AuthPrincipal, AuthService } from "./auth/service"
import type { createRepositories } from "./db/repositories"
import {
  authenticate,
  csrfValid,
  sameOrigin,
  scopeQuerySchema,
  sessionParamsSchema,
} from "./waha/session-http-support"
import { scheduleTimingSchema } from "./wall-clock"

type ScheduledJobsRepository = ReturnType<typeof createRepositories>["scheduledJobs"]
type ScheduledRouteRepositories = Pick<
  ReturnType<typeof createRepositories>,
  "scheduledJobs" | "auditEntries"
>
type StoredSchedule = NonNullable<Awaited<ReturnType<ScheduledJobsRepository["find"]>>>
type ScheduleAuth = Pick<AuthService, "authorize"> & {
  readonly authenticate: (token: string | undefined) => Promise<AuthPrincipal | null>
  readonly verifyCsrf: AuthService["verifyCsrf"]
}

const scheduleIdParamsSchema = z.object({ sessionId: z.string().uuid(), jobId: z.string().uuid() })
const editScheduleSchema = scheduleTimingSchema
const deletableStates: readonly StoredSchedule["state"][] = [
  "submitted",
  "acknowledged",
  "failed",
  "unknown",
  "cancelled",
]
function isMutableState(state: StoredSchedule["state"]): boolean {
  return state === "scheduled" || state === "queued"
}
function isDeletableState(state: StoredSchedule["state"]): boolean {
  return deletableStates.includes(state)
}

function safeSchedule(job: StoredSchedule) {
  return {
    id: job.id,
    sessionId: job.sessionId,
    accountScope: job.accountScope,
    scheduledFor: job.scheduledFor,
    timezone: job.timezone,
    state: job.state,
    attempts: job.attempts,
    nextAttemptAt: job.nextAttemptAt,
    providerMessageId: job.providerMessageId,
    recoveryCode: job.recoveryCode,
    failureCode: job.failureCode,
  }
}

async function authorizeSchedule(
  auth: ScheduleAuth,
  principal: AuthPrincipal,
  sessionId: string,
  scope: "personal" | "business",
  action: "read" | "command",
): Promise<boolean> {
  const decision = await auth.authorize(principal, sessionId, scope, action)
  return decision.allowed
}

export function registerScheduledRoutes(
  app: FastifyInstance,
  auth: ScheduleAuth,
  repositories: ScheduledRouteRepositories,
): void {
  const repository = repositories.scheduledJobs
  app.get("/scoped/sessions/:sessionId/messages/schedules", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { sessionId } = sessionParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    if (!(await authorizeSchedule(auth, principal, sessionId, scope, "read")))
      return reply.code(403).send({ error: "forbidden" })
    const jobs = await repository.listForSession(sessionId, scope)
    return reply.send(jobs.map(safeSchedule))
  })

  app.get("/scoped/sessions/:sessionId/messages/schedules/:jobId", async (request, reply) => {
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    const { sessionId, jobId } = scheduleIdParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    if (!(await authorizeSchedule(auth, principal, sessionId, scope, "read")))
      return reply.code(403).send({ error: "forbidden" })
    const job = await repository.find(jobId, scope)
    if (!job || job.sessionId !== sessionId) return reply.code(404).send({ error: "not_found" })
    return reply.send(safeSchedule(job))
  })

  app.put("/scoped/sessions/:sessionId/messages/schedules/:jobId", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (!(await csrfValid(auth, principal, request)))
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId, jobId } = scheduleIdParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    if (!(await authorizeSchedule(auth, principal, sessionId, scope, "command")))
      return reply.code(403).send({ error: "forbidden" })
    const body = editScheduleSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: "invalid request" })
    const current = await repository.find(jobId, scope)
    if (!current || current.sessionId !== sessionId)
      return reply.code(404).send({ error: "not_found" })
    if (!isMutableState(current.state) || current.leaseOwner)
      return reply.code(409).send({ error: "schedule_locked" })
    const updated = await repository.edit(jobId, scope, body.data)
    if (!updated) return reply.code(409).send({ error: "schedule_locked" })
    return reply.send(safeSchedule(updated))
  })

  app.post(
    "/scoped/sessions/:sessionId/messages/schedules/:jobId/cancel",
    async (request, reply) => {
      if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
      const principal = await authenticate(auth, request, reply)
      if (!principal) return
      if (!(await csrfValid(auth, principal, request)))
        return reply.code(403).send({ error: "forbidden" })
      const { sessionId, jobId } = scheduleIdParamsSchema.parse(request.params)
      const { scope } = scopeQuerySchema.parse(request.query)
      if (!(await authorizeSchedule(auth, principal, sessionId, scope, "command")))
        return reply.code(403).send({ error: "forbidden" })
      const current = await repository.find(jobId, scope)
      if (!current || current.sessionId !== sessionId)
        return reply.code(404).send({ error: "not_found" })
      if (current.state === "cancelled") {
        await repositories.auditEntries.append({
          action: "schedule.cancelled",
          subjectType: "scheduled_job",
          subjectId: jobId,
          accountScope: scope,
          sessionId,
          actorUserId: principal.userId,
        })
        return reply.send(safeSchedule(current))
      }
      if (!isMutableState(current.state) || current.leaseOwner)
        return reply.code(409).send({ error: "schedule_locked" })
      const cancelled = await repository.cancel(jobId, scope)
      if (!cancelled) return reply.code(409).send({ error: "schedule_locked" })
      await repositories.auditEntries.append({
        action: "schedule.cancelled",
        subjectType: "scheduled_job",
        subjectId: jobId,
        accountScope: scope,
        sessionId,
        actorUserId: principal.userId,
      })
      return reply.send(safeSchedule(cancelled))
    },
  )

  app.delete("/scoped/sessions/:sessionId/messages/schedules/:jobId", async (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ error: "forbidden" })
    const principal = await authenticate(auth, request, reply)
    if (!principal) return
    if (!(await csrfValid(auth, principal, request)))
      return reply.code(403).send({ error: "forbidden" })
    const { sessionId, jobId } = scheduleIdParamsSchema.parse(request.params)
    const { scope } = scopeQuerySchema.parse(request.query)
    if (!(await authorizeSchedule(auth, principal, sessionId, scope, "command")))
      return reply.code(403).send({ error: "forbidden" })
    const current = await repository.find(jobId, scope)
    if (!current || current.sessionId !== sessionId)
      return reply.code(404).send({ error: "not_found" })
    if (!isDeletableState(current.state) || current.leaseOwner)
      return reply.code(409).send({ error: "schedule_locked" })
    const removed = await repository.remove(jobId, scope)
    if (!removed) return reply.code(404).send({ error: "not_found" })
    await repositories.auditEntries.append({
      action: "schedule.deleted",
      subjectType: "scheduled_job",
      subjectId: jobId,
      accountScope: scope,
      sessionId,
      actorUserId: principal.userId,
    })
    return reply.send(safeSchedule(current))
  })
}
