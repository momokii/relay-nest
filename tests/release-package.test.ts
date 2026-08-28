import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { repositoryRoot } from "./release-checks-test-support"

const PACKAGE_COMMANDS = [
  ["verify:requirements", "requirements"],
  ["secret-scan", "secrets"],
  ["verify:scope", "scope"],
  ["docs:check", "docs"],
] as const

const RELEASE_COMMAND =
  "pnpm run build && pnpm run typecheck && pnpm run test && pnpm run test:e2e && pnpm audit --audit-level=high && pnpm run verify:requirements && pnpm run secret-scan && pnpm run verify:scope && pnpm run docs:check"

const BUNDLED_DEV_COMMAND =
  "docker compose -p relaynest-dev -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha up --build --wait -d"

const BUNDLED_DEPLOY_COMMAND =
  "docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha up --build --wait -d"

const EXTERNAL_DEPLOY_COMMAND =
  "docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml up --build --wait -d"

const DEPLOY_DOWN_COMMAND =
  "docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml --profile waha down --remove-orphans"

describe("release package commands", () => {
  it("exposes only the required local dispatcher commands", () => {
    // Given the checked-in package manifest
    const packageText = readFileSync(`${repositoryRoot}/package.json`, "utf8")

    // Then each command uses the pinned strip-types dispatcher without shell interpolation
    for (const [name, command] of PACKAGE_COMMANDS) {
      expect(packageText).toContain(
        `"${name}": "node --experimental-strip-types scripts/release-checks.mts ${command}"`,
      )
    }
  })

  it("keeps feature checks focused and release checks explicit", () => {
    // Given the checked-in package manifest
    const packageText = readFileSync(`${repositoryRoot}/package.json`, "utf8")

    // Then feature work cannot silently invoke release-wide validation
    expect(packageText).toContain(
      '"feature": "node --experimental-strip-types scripts/feature-check.mts"',
    )
    expect(packageText).toContain(`"release": "${RELEASE_COMMAND}"`)
    expect(packageText).toContain(`"dev:bundled": "${BUNDLED_DEV_COMMAND}"`)
    expect(packageText).toContain(`"deploy:bundled": "${BUNDLED_DEPLOY_COMMAND}"`)
    expect(packageText).toContain(`"deploy:external": "${EXTERNAL_DEPLOY_COMMAND}"`)
    expect(packageText).toContain(`"deploy:down": "${DEPLOY_DOWN_COMMAND}"`)
    expect(packageText).not.toContain('"feature": "pnpm test"')
  })

  it.each(PACKAGE_COMMANDS)("exits successfully for %s", (_name, command) => {
    // Given the exact local script target asserted in the package manifest
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/release-checks.mts", command],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    // Then the actual dispatcher exits zero without network bootstrap
    expect(result.status).toBe(0)
  })
})
