import { workspaceConfig } from "@waha-command-center/config"
import { z } from "zod"

import { createApiApp } from "./app"
import { createDatabase } from "./db/client"

const port =
  z.object({ PORT: z.coerce.number().int().min(1).max(65_535).optional() }).parse(process.env)
    .PORT ?? 3000
async function main(): Promise<void> {
  const database = createDatabase(workspaceConfig.databaseUrl)
  const allowLoopbackWaha =
    workspaceConfig.appEnv === "test" && process.argv.includes("--allow-loopback-for-tests")
  const app = createApiApp(database, { allowLoopbackWaha })
  await app.listen({ host: "0.0.0.0", port })
  console.info(`API listening in ${workspaceConfig.appEnv}`)
}

main().catch((error: unknown) => {
  if (error instanceof Error) console.error(`API startup failed: ${error.message}`)
  else console.error("API startup failed")
  process.exitCode = 1
})
