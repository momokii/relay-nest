import { execFile } from "node:child_process"
import { readFile, rm } from "node:fs/promises"
import process from "node:process"
import { promisify } from "node:util"
import { z } from "zod"

const execFileAsync = promisify(execFile)
const lifecyclePath = ".tmp/playwright/lifecycle.json"

const lifecycleSchema = z.object({
  apiPid: z.number().int().positive(),
  containerName: z.string().optional(),
  wahaPort: z.number().int().positive().optional(),
})

// biome-ignore lint/style/noDefaultExport: Playwright global teardown requires a default export.
export default async function globalTeardown(): Promise<void> {
  const lifecycle = await readFile(lifecyclePath, "utf8")
    .then((value) => lifecycleSchema.parse(JSON.parse(value)))
    .catch(() => undefined)
  if (lifecycle === undefined) return
  if (lifecycle?.apiPid !== undefined) {
    try {
      process.kill(-lifecycle.apiPid, "SIGTERM")
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("ESRCH")) throw error
    }
  }
  if (lifecycle?.containerName !== undefined)
    await execFileAsync("docker", ["stop", lifecycle.containerName]).catch(() => undefined)
  if (lifecycle?.wahaPort !== undefined)
    await fetch(`http://127.0.0.1:${lifecycle.wahaPort}/__e2e/shutdown`, {
      method: "POST",
    }).catch(() => undefined)
  await rm(".tmp/playwright", { recursive: true, force: true })
}
