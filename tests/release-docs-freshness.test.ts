import { describe, expect, it } from "vitest"

import {
  appendToFile,
  replaceInFile,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release documentation freshness", () => {
  it("rejects positive bundled-WAHA success claims while the boundary is blocked", async () => {
    // Given a disposable copy claiming the blocked bundled runtime is healthy and runnable
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          "README.md",
          "\nBundled WAHA is verified, runnable, and healthy in production.\n",
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports freshness drift without returning the claim
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain("verified, runnable, and healthy")
  })

  it("rejects a positive bundled-WAHA availability claim", async () => {
    // Given a disposable copy claiming bundled WAHA is available
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(root, "README.md", "\nBundled WAHA is available for production use.\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports stale release guidance
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
  })

  it("rejects a positive Todo 15 completion claim", async () => {
    // Given a disposable copy claiming Todo 15 is complete
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\nTodo 15 is complete.\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports stale release guidance
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
  })

  it("rejects a positive every-final-gate green claim", async () => {
    // Given a disposable copy claiming every final gate is green
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\nEvery final gate is green.\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports stale release guidance
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
  })

  it("rejects positive stale claims inside fenced code while preserving negative guidance", async () => {
    // Given a disposable copy containing a positive claim in a fenced example
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\n```text\nBundled WAHA is available.\n```\n"),
      async (root) => runCommand("docs", root),
    )

    // Then stale claims are rejected anywhere without treating fenced links/headings as real Markdown
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
  })

  it("rejects a positive all-final-gates completion claim", async () => {
    // Given a disposable copy claiming every release gate is complete
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(root, "README.md", "\nAll final release gates are complete and verified.\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the stale completion claim without returning its prose
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain("All final release gates are complete")
  })

  it.each([
    "Bundled runtime is available.",
    "Task 15 is complete.",
    "Task 16 is complete.",
    "All release checks passed.",
    "All final gates pass.",
    "Release readiness: PASS.",
    "No release blockers remain.",
  ])("rejects the direct stale claim %s", async (claim) => {
    // Given a disposable copy containing a direct positive release claim
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", `\n${claim}\n`),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports freshness drift without returning the claim
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain(claim)
  })

  it("rejects the direct stale claims when they occur inside a fenced example", async () => {
    // Given a disposable copy containing the direct claims in a fenced block
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          "README.md",
          [
            "",
            "```text",
            "Bundled runtime is available.",
            "Task 15 is complete.",
            "Task 16 is complete.",
            "All release checks passed.",
            "All final gates pass.",
            "Release readiness: PASS.",
            "No release blockers remain.",
            "```",
            "",
          ].join("\n"),
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the fenced positive claims still fail closed
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
  })

  it.each([
    ["next-phase bundled prerequisite", ".omo/plans/relaynest-next-phases.md", "- [ ] 8."],
    ["next-phase release tooling", ".omo/plans/relaynest-next-phases.md", "- [ ] 9."],
    ["protected bundled prerequisite", ".omo/plans/waha-command-center.md", "- [ ] 15."],
    ["protected release gate", ".omo/plans/waha-command-center.md", "- [ ] 16."],
  ])("rejects a checked %s marker", async (_name, planPath, marker) => {
    // Given a disposable copy whose blocked plan checkbox was changed to checked
    const result = await withCopiedRoot(
      (root) => replaceInFile(root, planPath, marker, marker.replace("[ ]", "[x]")),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the missing authoritative marker
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: planPath,
      line: 0,
      rule: "documentation-marker-missing",
      remediation: expect.any(String),
    })
  })
})
