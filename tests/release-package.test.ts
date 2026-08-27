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
