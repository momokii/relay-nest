import { describe, expect, it } from "vitest"

import { runReleaseCheck } from "../scripts/release-checks.mts"

import {
  removeFile,
  replaceInFile,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release requirements checker", () => {
  it("passes the current repository requirements", async () => {
    // Given a disposable copy of the checked-in RelayNest repository and its approved plan
    const result = await withCopiedRoot(
      async () => {},
      async (root) => runCommand("requirements", root),
    )

    // Then every mapped requirement is satisfied without diagnostics
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it("rejects an unresolved requirement in an isolated plan copy", async () => {
    // Given a disposable repository copy with an unresolved requirement marker
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          ".omo/plans/waha-command-center.md",
          "### Must have\n",
          "### Must have\n\n- unresolved Must-have\n",
        ),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker reports only the stable diagnostic shape
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".omo/plans/waha-command-center.md",
      line: expect.any(Number),
      rule: "requirements-unresolved",
      remediation: expect.any(String),
    })
  })

  it("rejects an unresolved Must-NOT-have in an isolated plan copy", async () => {
    // Given a disposable repository copy with an unresolved guardrail requirement
    const unresolvedRequirement = "do not expose synthetic-prose-guardrail"
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          ".omo/plans/waha-command-center.md",
          "### Must NOT have (guardrails, anti-slop, scope boundaries)\n",
          `### Must NOT have (guardrails, anti-slop, scope boundaries)\n\n- ${unresolvedRequirement}\n`,
        ),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker reports the plan location without returning requirement prose
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".omo/plans/waha-command-center.md",
      line: expect.any(Number),
      rule: "requirements-unmapped",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain(unresolvedRequirement)
  })

  it("rejects a missing declared marker in an isolated copy", async () => {
    // Given a disposable repository copy without a mapped implementation file
    const result = await withCopiedRoot(
      (root) => replaceInFile(root, "apps/api/src/app.ts", "createApiApp", "createApplication"),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker reports the deterministic marker failure
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "apps/api/src/app.ts",
      line: 0,
      rule: "requirements-marker-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects a missing referenced evidence file in an isolated copy", async () => {
    // Given a disposable repository copy without a mapped reference file
    const result = await withCopiedRoot(
      (root) => removeFile(root, "docs/threat-model.md"),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker reports the deterministic missing-file failure without source prose
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "docs/threat-model.md",
      line: 0,
      rule: "requirements-file-missing",
      remediation: expect.any(String),
    })
  })

  it.each([
    ["absolute", "/tmp/relaynest-outside-plan.md"],
    ["parent", "../relaynest-outside-plan.md"],
    ["nested parent", ".omo/plans/../../relaynest-outside-plan.md"],
  ])("rejects a %s plan path before reading outside the selected root", async (_label, plan) => {
    // Given a disposable repository copy and an external plan path
    const result = await withCopiedRoot(
      async () => {},
      async (root) => runReleaseCheck(["requirements", "--root", root, "--plan", plan], root),
    )

    // Then the checker returns one redacted boundary diagnostic without the target path
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<plan>",
        line: 0,
        rule: "requirements-plan-boundary",
        remediation: expect.any(String),
      },
    ])
    expect(JSON.stringify(result.diagnostics)).not.toContain(plan)
  })
})
