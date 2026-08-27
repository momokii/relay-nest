import { describe, expect, it } from "vitest"

import {
  appendToFile,
  removeFile,
  replaceInFile,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release documentation structure", () => {
  it("passes the current repository documentation scan", async () => {
    // Given a disposable copy of the checked-in README and operational documentation
    const result = await withCopiedRoot(
      async () => {},
      async (root) => runCommand("docs", root),
    )

    // Then documentation freshness is reported as clean
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it("rejects stale release guidance in an isolated README copy", async () => {
    // Given a disposable copy with a stale operational statement
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\nRelease status: complete and fully verified.\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports documentation drift without returning the stale text
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain("complete and fully verified")
  })

  it("rejects a missing source-of-truth document in an isolated copy", async () => {
    // Given a disposable copy without the operational source-of-truth document
    const result = await withCopiedRoot(
      (root) => removeFile(root, "docs/operations.md"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the stable missing-documentation diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "docs/operations.md",
      line: 0,
      rule: "documentation-file-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects a missing exact next-phase plan", async () => {
    // Given a disposable copy without the authoritative next-phase plan
    const result = await withCopiedRoot(
      (root) => removeFile(root, ".omo/plans/relaynest-next-phases.md"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the missing plan as required release guidance
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".omo/plans/relaynest-next-phases.md",
      line: 0,
      rule: "documentation-file-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects a changed exact next-phase plan marker", async () => {
    // Given a disposable copy whose next-phase plan no longer has its stable header
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          ".omo/plans/relaynest-next-phases.md",
          "# relaynest-next-phases - Work Plan",
          "# changed plan",
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the missing authoritative marker
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".omo/plans/relaynest-next-phases.md",
      line: 0,
      rule: "documentation-marker-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects missing current bundled-WAHA blocker evidence", async () => {
    // Given a disposable copy without the exact current image fact in operations guidance
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          "docs/operations.md",
          "devlikeapro/waha:2026.8.1",
          "devlikeapro/waha:changed",
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the missing blocker marker without exposing content
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "docs/operations.md",
      line: 0,
      rule: "documentation-marker-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects missing Task 15 blocker evidence", async () => {
    // Given a disposable copy without the Task 15 manifest-failure evidence
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          ".omo/evidence/task-15-next-phases-operations.md",
          "exact image availability checks failed",
          "manifest result changed",
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the missing evidence marker
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".omo/evidence/task-15-next-phases-operations.md",
      line: 0,
      rule: "documentation-marker-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects a missing dedicated bundled evidence document", async () => {
    // Given a disposable copy without the dedicated bundled-runtime evidence
    const result = await withCopiedRoot(
      (root) => removeFile(root, ".omo/evidence/task-15-next-phases-bundled.md"),
      async (root) => runCommand("docs", root),
    )

    // Then the dedicated blocker evidence is required independently
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".omo/evidence/task-15-next-phases-bundled.md",
      line: 0,
      rule: "documentation-file-missing",
      remediation: expect.any(String),
    })
  })
})
