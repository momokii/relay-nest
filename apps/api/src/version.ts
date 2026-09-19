import type { FastifyInstance } from "fastify"
import pkg from "../../../package.json" with { type: "json" }

const fallbackVersion: string = (pkg as { version?: string }).version ?? "1.0.0"

export type VersionInfo = Readonly<{
  version: string
  commit: string
  buildTime: string
}>

export function getVersionInfo(): VersionInfo {
  const version = process.env["APP_VERSION"] ?? fallbackVersion
  const commit = process.env["GIT_SHA"] ?? process.env["APP_COMMIT"] ?? "dev"
  const buildTime =
    process.env["BUILD_TIME"] ?? process.env["BUILD_DATE"] ?? new Date().toISOString()
  return { version, commit, buildTime }
}

export function registerVersionRoutes(app: FastifyInstance): void {
  app.get("/version", async () => getVersionInfo())
}
