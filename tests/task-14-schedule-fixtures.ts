import { createApiApp } from "../apps/api/src/app"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.TASK14_DATABASE_URL
export const database = databaseUrl ? createDatabase(databaseUrl) : undefined
export const repositories = database ? createRepositories(database.db) : undefined
export const app = database ? createApiApp(database) : undefined

export type ScheduleContext = Readonly<{
  cookie: string
  csrf: string
  userId: string
  sessionId: string
  jobId: string
}>

export async function seedSchedule(): Promise<ScheduleContext> {
  if (!app || !repositories) throw new Error("TASK14_DATABASE_URL is required")
  const bootstrap = await app.inject({
    method: "POST",
    url: "/auth/bootstrap",
    payload: {
      email: `task14-schedule-${crypto.randomUUID()}@example.invalid`,
      password: "opaque-test-password",
      displayName: "Task 14 Admin",
    },
  })
  const cookies = bootstrap.headers["set-cookie"] ?? []
  const cookie = cookies.find((value) => value.startsWith("waha_session="))?.split(";", 1)[0]
  const csrf = cookies
    .find((value) => value.startsWith("waha_csrf="))
    ?.split("=", 2)[1]
    ?.split(";", 1)[0]
  if (!cookie || !csrf) throw new Error("authenticated test cookies unavailable")

  const connection = await repositories.wahaConnections.create({
    name: `task14-schedule-connection-${crypto.randomUUID()}`,
    baseUrl: "http://waha.internal",
    apiKeyCiphertext: "opaque",
    apiKeyNonce: "opaque",
    apiKeyAuthTag: "opaque",
  })
  const session = await repositories.sessions.create({
    connectionId: connection.id,
    accountScope: "personal",
    name: `task14-schedule-session-${crypto.randomUUID()}`,
    wahaSessionName: `task14-schedule-waha-${crypto.randomUUID()}`,
    status: "linked",
  })
  const job = await repositories.scheduledJobs.create({
    sessionId: session.id,
    accountScope: "personal",
    recipientPhoneCiphertext: "opaque",
    recipientPhoneNonce: "opaque",
    recipientPhoneAuthTag: "opaque",
    messageCiphertext: "opaque",
    messageNonce: "opaque",
    messageAuthTag: "opaque",
    scheduledFor: new Date("2099-01-01T00:00:00.000Z"),
    timezone: "UTC",
    idempotencyKey: `task14-schedule-job-${crypto.randomUUID()}`,
  })
  const userId = bootstrap.json<{ readonly user: { readonly id: string } }>().user.id
  await repositories.sessionGrants.create({
    userId,
    sessionId: session.id,
    accountScope: "personal",
  })
  return { cookie, csrf, userId, sessionId: session.id, jobId: job.id }
}

export async function seedAdditionalSchedule(context: ScheduleContext): Promise<ScheduleContext> {
  if (!repositories) throw new Error("TASK14_DATABASE_URL is required")
  const connection = await repositories.wahaConnections.create({
    name: `task14-schedule-second-connection-${crypto.randomUUID()}`,
    baseUrl: "http://waha.internal",
    apiKeyCiphertext: "opaque",
    apiKeyNonce: "opaque",
    apiKeyAuthTag: "opaque",
  })
  const session = await repositories.sessions.create({
    connectionId: connection.id,
    accountScope: "personal",
    name: `task14-schedule-second-session-${crypto.randomUUID()}`,
    wahaSessionName: `task14-schedule-second-waha-${crypto.randomUUID()}`,
    status: "linked",
  })
  const job = await repositories.scheduledJobs.create({
    sessionId: session.id,
    accountScope: "personal",
    recipientPhoneCiphertext: "opaque",
    recipientPhoneNonce: "opaque",
    recipientPhoneAuthTag: "opaque",
    messageCiphertext: "opaque",
    messageNonce: "opaque",
    messageAuthTag: "opaque",
    scheduledFor: new Date("2099-01-03T00:00:00.000Z"),
    timezone: "UTC",
    idempotencyKey: `task14-schedule-second-job-${crypto.randomUUID()}`,
  })
  await repositories.sessionGrants.create({
    userId: context.userId,
    sessionId: session.id,
    accountScope: "personal",
  })
  return { ...context, sessionId: session.id, jobId: job.id }
}

export function mutationHeaders(context: ScheduleContext): Record<string, string> {
  return {
    cookie: context.cookie,
    "x-csrf-token": context.csrf,
    origin: "http://localhost:80",
  }
}

export async function resetScheduleDatabase(): Promise<void> {
  await database?.sql.unsafe(
    "TRUNCATE auth_sessions, auth_rate_limits, session_grants, user_roles, users, audit_entries, scheduled_jobs, sessions, waha_connections CASCADE",
  )
}
