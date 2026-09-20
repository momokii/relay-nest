import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const packageText = readFileSync(new URL("../package.json", import.meta.url), "utf8")
const shutdown = readFileSync(new URL("../scripts/shutdown.sh", import.meta.url), "utf8")
const healthcheck = readFileSync(new URL("../scripts/healthcheck.sh", import.meta.url), "utf8")
const trustReport = readFileSync(new URL("../scripts/trust-report.sh", import.meta.url), "utf8")

describe("operational scripts", () => {
  it("exposes the shutdown, health, and trust commands", () => {
    expect(packageText).toContain('"shutdown": "bash scripts/shutdown.sh"')
    expect(packageText).toContain('"healthcheck": "bash scripts/healthcheck.sh"')
    expect(packageText).toContain('"trust": "bash scripts/trust-report.sh"')
  })

  it("keeps shutdown non-destructive by default", () => {
    expect(shutdown).toContain("bundled|external|dev")
    expect(shutdown).toContain("down --remove-orphans")
    expect(shutdown).not.toContain("--volumes")
  })

  it("checks private deployment dependencies and runtime version", () => {
    expect(healthcheck).toContain("postgres pg_isready")
    expect(healthcheck).toContain("127.0.0.1:3000/version")
    expect(healthcheck).toContain("127.0.0.1:3000/health")
    expect(healthcheck).toContain("127.0.0.1:4173/")
    expect(healthcheck).toContain("org.opencontainers.image.version")
    expect(healthcheck).toContain("bundled WAHA is unavailable")
  })

  it("bases the trust report on redacted repository and deployment checks", () => {
    expect(trustReport).toContain("pnpm@10.12.4 secret-scan")
    expect(trustReport).toContain("pnpm@10.12.4 verify:scope")
    expect(trustReport).toContain("pnpm@10.12.4 docs:check")
    expect(trustReport).toContain("scripts/healthcheck.sh")
    expect(trustReport).not.toContain("cat .secrets")
  })
})
