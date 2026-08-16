import { readFileSync } from "node:fs"

import { z } from "zod"

export type { EncryptedEnvelope, EnvelopeMetadata } from "./encryption"
export { createBlindIndex, createEnvelopeCipher, EnvelopeEncryptionError } from "./encryption"

const appEnvSchema = z.enum(["development", "test", "staging", "production"])
const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === "postgresql:" || protocol === "postgres:"
  }, "database URL must use PostgreSQL")
const environmentSchema = z.object({
  APP_ENV: appEnvSchema.optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  WAHA_BASE_URL: z.string().url().default("http://waha.internal"),
  DATABASE_URL: z.string().optional(),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_PASSWORD_FILE: z.string().optional(),
  ENCRYPTION_MASTER_KEY: z.string().base64().optional(),
})

const parsedEnvironment = environmentSchema.parse(process.env)

export class EnvironmentConfigError extends Error {
  readonly name = "EnvironmentConfigError"
}

const composeDatabaseSchema = z.object({
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1).optional(),
  DATABASE_PASSWORD_FILE: z.string().min(1).optional(),
})

type DatabaseEnvironment = Readonly<Record<string, string | undefined>> & {
  readonly DATABASE_URL?: string | undefined
}

export function resolveDatabaseUrl(environment: DatabaseEnvironment): string {
  const databaseUrl = environment.DATABASE_URL
  const composeKeys = [
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_PASSWORD_FILE",
  ] as const
  const hasComposeConfiguration = composeKeys.some((key) => environment[key] !== undefined)

  if (databaseUrl !== undefined && hasComposeConfiguration) {
    throw new EnvironmentConfigError("database configuration must use one URL format")
  }

  if (databaseUrl !== undefined) {
    const parsedUrl = databaseUrlSchema.safeParse(databaseUrl)
    if (!parsedUrl.success) {
      throw new EnvironmentConfigError("database configuration is invalid")
    }
    return parsedUrl.data
  }

  if (!hasComposeConfiguration) {
    throw new EnvironmentConfigError("database configuration is missing")
  }

  const parsedCompose = composeDatabaseSchema.safeParse(environment)
  if (!parsedCompose.success) {
    throw new EnvironmentConfigError("database configuration is incomplete")
  }

  const { DATABASE_PASSWORD_FILE: passwordFile, DATABASE_PASSWORD: password } = parsedCompose.data
  if ((password === undefined) === (passwordFile === undefined)) {
    throw new EnvironmentConfigError("database configuration needs one password source")
  }

  let resolvedPassword = password
  if (passwordFile !== undefined) {
    try {
      resolvedPassword = readFileSync(passwordFile, "utf8").trim()
    } catch {
      throw new EnvironmentConfigError("database password file is unavailable")
    }
  }
  if (!resolvedPassword) {
    throw new EnvironmentConfigError("database password is empty")
  }

  const url = new URL("postgresql://localhost")
  url.hostname = parsedCompose.data.DATABASE_HOST
  url.port = String(parsedCompose.data.DATABASE_PORT)
  url.username = parsedCompose.data.DATABASE_USER
  url.password = resolvedPassword
  url.pathname = `/${parsedCompose.data.DATABASE_NAME}`
  return url.toString()
}

export const workspaceConfig = {
  appEnv:
    parsedEnvironment.APP_ENV ?? (parsedEnvironment.NODE_ENV === "test" ? "test" : "development"),
  wahaBaseUrl: parsedEnvironment.WAHA_BASE_URL,
  databaseUrl: resolveDatabaseUrl(parsedEnvironment),
  encryptionMasterKey: parsedEnvironment.ENCRYPTION_MASTER_KEY
    ? Buffer.from(parsedEnvironment.ENCRYPTION_MASTER_KEY, "base64")
    : undefined,
} as const

export type WorkspaceConfig = typeof workspaceConfig
