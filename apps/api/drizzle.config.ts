import { resolveDatabaseUrl } from "@waha-command-center/config"
import { defineConfig } from "drizzle-kit"

const databaseUrl = resolveDatabaseUrl(process.env)

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
})
