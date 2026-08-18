import { type ChildProcess, execFile, spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { promisify } from "node:util"

import { type FullConfig, request as playwrightRequest } from "@playwright/test"
import { z } from "zod"

import {
  authCredentialsPath,
  bootstrapOrLogin,
  type E2EAuthCredentials,
  principalSchema,
} from "./auth-fixture"
import { seedE2EData } from "./seed-fixture"

const execFileAsync = promisify(execFile)
const apiPort = 4317
const apiUrl = `http://127.0.0.1:${apiPort}`
const stateDirectory = ".tmp/playwright"
const statePath = `${stateDirectory}/auth.json`
const lifecyclePath = `${stateDirectory}/lifecycle.json`
const seededSessionsSchema = z.array(z.object({ id: z.string(), name: z.string() }))

type DatabaseRuntime = Readonly<{
  readonly databaseUrl: string
  readonly containerName?: string
}>

type SeedRuntime = Readonly<{
  readonly wahaPort: number
}>

// biome-ignore lint/style/noDefaultExport: Playwright global setup requires a default export.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await mkdir(stateDirectory, { recursive: true })
  const database = await startDatabase()
  let apiPid: number | undefined
  let seedRuntime: SeedRuntime | undefined
  try {
    await migrate(database.databaseUrl)
    Object.assign(process.env, e2eEnvironment(database.databaseUrl))
    const api = await startApi(database.databaseUrl)
    apiPid = api.pid
    await waitForApi()
    const authRequest = await playwrightRequest.newContext({ baseURL: apiUrl })
    try {
      const credentials = authCredentials()
      await bootstrapOrLogin(authRequest, credentials)
      await writeFile(authCredentialsPath, JSON.stringify(credentials), {
        encoding: "utf8",
        mode: 0o600,
      })
      const principalResponse = await authRequest.get("/auth/me")
      if (!principalResponse.ok())
        throw new Error(
          `E2E authenticated principal check failed with status ${principalResponse.status()}`,
        )
      const principal = principalSchema.parse(await principalResponse.json())
      const seed = await seedE2EData({
        databaseUrl: database.databaseUrl,
        userId: principal.user.id,
      })
      seedRuntime = { wahaPort: seed.wahaPort }
      await verifySeed(authRequest, seed.metadata)
      await authRequest.storageState({ path: statePath })
    } finally {
      await authRequest.dispose()
    }
    if (apiPid === undefined) throw new Error("E2E API process did not expose a PID")
    await writeFile(
      lifecyclePath,
      JSON.stringify({ apiPid, containerName: database.containerName, ...seedRuntime }),
      {
        encoding: "utf8",
        mode: 0o600,
      },
    )
  } catch (error) {
    if (apiPid !== undefined) {
      try {
        process.kill(-apiPid, "SIGTERM")
      } catch (killError) {
        if (!(killError instanceof Error) || !killError.message.includes("ESRCH")) throw killError
      }
    }
    if (seedRuntime !== undefined) await stopWahaFixture(seedRuntime.wahaPort)
    await stopDatabase(database.containerName)
    throw error
  }
}

async function verifySeed(
  request: import("@playwright/test").APIRequestContext,
  metadata: Awaited<ReturnType<typeof seedE2EData>>["metadata"],
): Promise<void> {
  for (const scope of ["personal", "business"] as const) {
    const response = await request.get(`/scoped/sessions?scope=${scope}`)
    if (!response.ok())
      throw new Error(`E2E ${scope} session seed check failed with status ${response.status()}`)
    const sessions = seededSessionsSchema.parse(await response.json())
    if (
      sessions.length !== 1 ||
      sessions[0]?.id !== metadata[scope].id ||
      sessions[0]?.name !== metadata[scope].name
    )
      throw new Error(`E2E ${scope} session seed check returned an unexpected result`)
  }
}

async function startDatabase(): Promise<DatabaseRuntime> {
  const injectedUrl = process.env.E2E_DATABASE_URL
  if (injectedUrl !== undefined) return { databaseUrl: injectedUrl }

  const containerName = `relaynest-e2e-postgres-${process.pid}`
  const password = `e2e-${crypto.randomUUID()}`
  await execFileAsync("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--env",
    "POSTGRES_DB=relaynest_e2e",
    "--env",
    "POSTGRES_USER=relaynest_e2e",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "--publish",
    "127.0.0.1::5432",
    "postgres:16-alpine",
  ])
  try {
    const port = await waitForDatabasePort(containerName)
    await waitForDatabase(containerName)
    return {
      containerName,
      databaseUrl: `postgresql://relaynest_e2e:${encodeURIComponent(password)}@127.0.0.1:${port}/relaynest_e2e`,
    }
  } catch (error) {
    await stopDatabase(containerName)
    throw error
  }
}

async function waitForDatabasePort(containerName: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await execFileAsync("docker", ["port", containerName, "5432/tcp"]).catch(() => ({
      stdout: "",
    }))
    const port = result.stdout.trim().match(/:(\d+)$/)?.[1]
    if (port !== undefined) return port
    await delay(250)
  }
  throw new Error("E2E PostgreSQL did not publish a port")
}

async function waitForDatabase(containerName: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await execFileAsync("docker", [
      "exec",
      containerName,
      "pg_isready",
      "--username=relaynest_e2e",
      "--dbname=relaynest_e2e",
    ]).catch(() => undefined)
    if (result !== undefined) return
    await delay(250)
  }
  throw new Error("E2E PostgreSQL did not become ready")
}

async function migrate(databaseUrl: string): Promise<void> {
  await execFileAsync(
    "npx",
    ["--yes", "pnpm@10.12.4", "--filter", "@waha-command-center/api", "db:migrate"],
    {
      env: e2eEnvironment(databaseUrl),
    },
  )
}

async function startApi(databaseUrl: string): Promise<ChildProcess> {
  await execFileAsync(
    "npx",
    ["--yes", "pnpm@10.12.4", "--filter", "@waha-command-center/api", "build"],
    {
      env: e2eEnvironment(databaseUrl),
    },
  )
  return spawn(
    "npx",
    [
      "--yes",
      "pnpm@10.12.4",
      "--filter",
      "@waha-command-center/api",
      "start",
      "--",
      "--allow-loopback-for-tests",
    ],
    { env: e2eEnvironment(databaseUrl), detached: true, stdio: "inherit" },
  )
}

async function waitForApi(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`${apiUrl}/health`).catch(() => undefined)
    if (response?.ok) return
    await delay(250)
  }
  throw new Error("E2E API did not become ready")
}

function authCredentials(): E2EAuthCredentials {
  const email = process.env.E2E_AUTH_EMAIL
  const password = process.env.E2E_AUTH_PASSWORD
  if (process.env.E2E_DATABASE_URL !== undefined && (email === undefined || password === undefined))
    throw new Error("E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD are required with E2E_DATABASE_URL")
  return {
    email: email ?? `e2e-${crypto.randomUUID()}@example.invalid`,
    password: password ?? `e2e-${crypto.randomUUID()}-password`,
    displayName: process.env.E2E_AUTH_DISPLAY_NAME ?? "E2E Admin",
  }
}

function e2eEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APP_ENV: "test",
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    PORT: String(apiPort),
    WAHA_BASE_URL: "http://waha.e2e.invalid",
    ENCRYPTION_MASTER_KEY: Buffer.alloc(32).toString("base64"),
  }
}

async function stopWahaFixture(port: number): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/__e2e/shutdown`, { method: "POST" }).catch(() => undefined)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function stopDatabase(containerName: string | undefined): Promise<void> {
  if (containerName === undefined) return
  await execFileAsync("docker", ["stop", containerName]).catch(() => undefined)
}

export { lifecyclePath, statePath, stopDatabase }
