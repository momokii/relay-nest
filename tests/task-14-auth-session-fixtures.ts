import { createApiApp } from "../apps/api/src/app"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"
import type { StoredSession, WahaSessionClient } from "../apps/api/src/waha/session-types"
import { WahaConnectionUnavailableError } from "../apps/api/src/waha/session-types"
import { createScopedSessionService } from "../apps/api/src/waha/sessions"

const databaseUrl = process.env.TASK14_AUTH_SESSION_DATABASE_URL
export const database = databaseUrl ? createDatabase(databaseUrl) : undefined
export const repositories = database ? createRepositories(database.db) : undefined

function fixtureClient(): WahaSessionClient {
  const session = {
    name: "personal-fixture",
    presence: {},
    timestamps: { activity: null },
    status: "WORKING",
  } as const
  return {
    sessions: async () => [session],
    session: async () => session,
    createSession: async () => session,
    updateSession: async () => session,
    remove: async () => undefined,
    start: async () => ({ ...session, status: "WORKING" }),
    stop: async () => ({ ...session, status: "STOPPED" }),
    restart: async () => ({ ...session, status: "WORKING" }),
    logout: async () => ({ ...session, status: "STOPPED" }),
    qr: async () => ({ value: "fixture-qr" }),
    requestPairingCode: async () => undefined,
    passkeyChallenge: async () => ({ challenge: "fixture-challenge" }),
    passkeyAssertion: async () => undefined,
    passkeyConfirmation: async () => ({ code: "fixture-code" }),
    confirmPasskey: async () => undefined,
    me: async () => ({ id: "fixture-id", pushname: "Fixture" }),
    messages: async () => [],
    timelock: async () => ({ locked: false }),
    capping: async () => ({ remaining: 100 }),
    checkExists: async () => ({ numberExists: false }),
    contact: async () => ({ id: "fixture-contact" }),
    sendText: async () => ({ id: "fixture-message" }),
  }
}

function createSessionService() {
  if (!repositories) return undefined
  const history = [
    { status: "STARTING", observedAt: "2026-08-17T10:01:00.000Z" },
    { status: "WORKING", observedAt: "2026-08-17T10:02:00.000Z" },
  ] as const
  const repository = {
    list: (scope: "personal" | "business") => repositories.sessions.list(scope),
    find: (id: string, scope: "personal" | "business") => repositories.sessions.find(id, scope),
    hasGrant: async (userId: string, id: string, scope: "personal" | "business") =>
      Boolean(await repositories.sessionGrants.find(userId, id, scope)),
    saveStatus: (
      id: string,
      scope: "personal" | "business",
      status: string,
      observedAt = new Date(),
    ) => repositories.sessions.updateStatus(id, scope, status, observedAt),
    statusHistory: async () => history,
    create: async (input: Omit<StoredSession, "id">) => repositories.sessions.create(input),
    update: (id: string, scope: "personal" | "business", input: Partial<StoredSession>) =>
      repositories.sessions.update(id, scope, input),
    remove: (id: string, scope: "personal" | "business") => repositories.sessions.remove(id, scope),
  }
  return createScopedSessionService({
    repository,
    clientFor: () => fixtureClient(),
    clientForConnection: () => fixtureClient(),
  })
}

const service = createSessionService()
const unavailableService = repositories
  ? createScopedSessionService({
      repository: {
        list: (scope) => repositories.sessions.list(scope),
        find: (id, scope) => repositories.sessions.find(id, scope),
        hasGrant: async (userId, id, scope) =>
          Boolean(await repositories.sessionGrants.find(userId, id, scope)),
        saveStatus: (id, scope, status, observedAt = new Date()) =>
          repositories.sessions.updateStatus(id, scope, status, observedAt),
      },
      clientFor: async () => {
        throw new WahaConnectionUnavailableError()
      },
    })
  : undefined

export const app =
  database && service ? createApiApp(database, { sessionService: service }) : undefined
export const unavailableApp =
  database && unavailableService
    ? createApiApp(database, { sessionService: unavailableService })
    : undefined

function cookies(headers: Record<string, string | string[] | undefined>) {
  const values = headers["set-cookie"]
  return Array.isArray(values) ? values : values ? [values] : []
}

export function authHeaders(response: { headers: Record<string, string | string[] | undefined> }) {
  const setCookies = cookies(response.headers)
  const session = setCookies.find((value) => value.startsWith("waha_session="))?.split(";", 1)[0]
  const csrf = setCookies
    .find((value) => value.startsWith("waha_csrf="))
    ?.split("=", 2)[1]
    ?.split(";", 1)[0]
  return { cookie: `${session}; waha_csrf=${csrf}`, csrf }
}
