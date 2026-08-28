import { describe, expect, it } from "vitest"

import { buildFeatureCommandPlan, parseFeatureArguments } from "../scripts/feature-check.mts"
import { repositoryRoot } from "./release-checks-test-support"

describe("feature workflow", () => {
  it("requires a focused regression test, name, and scoped paths", () => {
    // Given an invocation with no feature focus
    const result = parseFeatureArguments([], repositoryRoot)

    // Then it fails before any broad check can run
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected invalid feature arguments")
    expect(result.exitCode).toBe(2)
    expect(result.message).toContain("--test-file")
  })

  it("builds only focused Vitest, typecheck, and scoped Biome commands", () => {
    // Given a focused regression test and the files changed by the feature
    const result = parseFeatureArguments(
      [
        "--test-file",
        "tests/compose-startup.test.ts",
        "--test-name",
        "bundled API startup",
        "--paths",
        "tests/compose-startup.test.ts",
        "docker-compose.yml",
      ],
      repositoryRoot,
    )
    if (!result.ok) throw new Error(result.message)

    // When the fast feature plan is built
    const plan = buildFeatureCommandPlan(result.options)
    const serialized = JSON.stringify(plan)

    // Then release-wide work is impossible through this command
    expect(plan).toHaveLength(3)
    expect(serialized).toContain("vitest")
    expect(serialized).toContain("bundled API startup")
    expect(serialized).toContain("typecheck")
    expect(serialized).toContain("biome")
    expect(serialized).not.toContain("test:e2e")
    expect(serialized).not.toContain("audit")
    expect(serialized).not.toContain("secret-scan")
    expect(serialized).not.toContain("verify:scope")
    expect(serialized).not.toContain("docs:check")
  })

  it("rejects a missing test file, missing test name, and outside path", () => {
    // Given malformed or unsafe focus arguments
    const cases = [
      ["--test-name", "some test", "--paths", "tests/compose-startup.test.ts"],
      ["--test-file", "tests/compose-startup.test.ts", "--paths", "tests/compose-startup.test.ts"],
      [
        "--test-file",
        "../outside.test.ts",
        "--test-name",
        "some test",
        "--paths",
        "tests/compose-startup.test.ts",
      ],
    ] as const

    // Then every malformed invocation fails closed
    for (const argv of cases) {
      const result = parseFeatureArguments(argv, repositoryRoot)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.exitCode).toBe(2)
    }
  })
})
