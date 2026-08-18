import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8")
const webDockerfile = readFileSync(new URL("../Dockerfile.web", import.meta.url), "utf8")
const viteConfig = readFileSync(new URL("../apps/web/vite.config.ts", import.meta.url), "utf8")

function serviceBlock(composeFile: string, serviceName: string): string {
  const lines = composeFile.split("\n")
  const start = lines.findIndex((line) => line === `  ${serviceName}:`)
  if (start < 0) throw new Error(`Compose service not found: ${serviceName}`)

  const block: string[] = []
  for (const line of lines.slice(start)) {
    if (block.length > 0 && /^ {2}[a-z][a-z0-9-]*:\s*$/.test(line)) break
    block.push(line)
  }
  return block.join("\n")
}

describe("external Compose web/API boundary", () => {
  it("keeps the API private to the Compose network", () => {
    // Given the production API service is reachable by the internal web proxy
    const apiService = serviceBlock(compose, "api")

    // Then Compose does not publish the API directly on the host network
    expect(apiService).toContain('expose:\n      - "3000"')
    expect(apiService).not.toContain("ports:")
    expect(apiService).not.toContain("API_PORT")
  })

  it("routes same-origin API paths through the internal API service", () => {
    // Given the production web container serves the browser bundle
    const webService = serviceBlock(compose, "web")

    // When Compose starts Vite preview for the web service
    // Then its same-origin API paths have an internal proxy target, not a browser-visible API host
    expect(webService).toContain("VITE_API_PROXY_TARGET: http://api:3000")
    expect(webService).not.toMatch(/33001|WAHA_BASE_URL|WAHA_API_KEY/)
    expect(webDockerfile).toContain("/workspace/apps/web/vite.config.ts ./apps/web/vite.config.ts")
    for (const path of ["/auth", "/admin", "/scoped", "/health"]) {
      expect(viteConfig).toContain(`"${path}": { target: apiProxyTarget }`)
    }
    expect(viteConfig).toContain("server: { proxy: apiProxy }")
    expect(viteConfig).toContain("preview: { proxy: apiProxy }")
  })
})
