import { describe, expect, it } from "vitest"

import { runReleaseCheck } from "../scripts/release-checks.mts"

import {
  appendToFile,
  createDirectoryEntries,
  createOutsideFile,
  createSymlink,
  removeFile,
  replaceInFile,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release requirements integrity", () => {
  it("rejects an extra Must-NOT-have heading as non-canonical", async () => {
    // Given a disposable repository copy with a malformed heading and an unresolved bullet beneath it
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          ".omo/plans/waha-command-center.md",
          "### Must NOT have (guardrails, anti-slop, scope boundaries)",
          "### Must NOT have extra\n\n- unresolved malformed guardrail",
        ),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker rejects the malformed canonical section
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "<plan>",
      line: 0,
      rule: "requirements-section-invalid",
      remediation: expect.any(String),
    })
  })

  it.each([
    ["missing", "### Must have", "### Missing section"],
    ["empty", "### Must have\n", "### Must have\n\n### Must NOT have"],
    ["duplicate", "### Must have", "### Must have\n\n- duplicate section\n### Must have"],
  ])("rejects a %s canonical requirements section", async (_name, search, replacement) => {
    // Given a disposable plan with a missing, empty, or duplicate canonical section
    const result = await withCopiedRoot(
      (root) => replaceInFile(root, ".omo/plans/waha-command-center.md", search, replacement),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker reports the stable plan-structure diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "<plan>",
      line: 0,
      rule: "requirements-section-invalid",
      remediation: expect.any(String),
    })
  })

  it("rejects a symlinked evidence file without reading outside the root", async () => {
    // Given a disposable copy whose mapped reference is replaced by an outside symlink
    const result = await withCopiedRoot(
      async (root) => {
        await removeFile(root, "docs/threat-model.md")
        await createSymlink(root, "docs/threat-model.md", "/etc/passwd")
      },
      async (root) => runCommand("requirements", root),
    )

    // Then the checker returns a redacted evidence-read diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "<root>",
      line: 0,
      rule: "requirements-file-read",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain("passwd")
  })

  it("rejects a directory used as mapped evidence", async () => {
    // Given a disposable copy whose mapped reference path is a directory
    const result = await withCopiedRoot(
      async (root) => {
        await removeFile(root, "docs/threat-model.md")
        await createDirectoryEntries(root, "docs/threat-model.md", 0)
      },
      async (root) => runCommand("requirements", root),
    )

    // Then the checker returns a redacted evidence-read diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "<root>",
      line: 0,
      rule: "requirements-file-read",
      remediation: expect.any(String),
    })
  })

  it("rejects a symlinked plan before reading its outside target", async () => {
    // Given a disposable copy whose plan path is replaced by an outside symlink
    const result = await withCopiedRoot(
      async (root) => {
        await createOutsideFile(root, "outside-plan.md")
        await removeFile(root, ".omo/plans/waha-command-center.md")
        await createSymlink(root, ".omo/plans/waha-command-center.md", "../../outside-plan.md")
      },
      async (root) =>
        runReleaseCheck(
          ["requirements", "--root", root, "--plan", ".omo/plans/waha-command-center.md"],
          root,
        ),
    )

    // Then the checker returns only the redacted plan-read diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      { path: "<root>", line: 0, rule: "requirements-file-read", remediation: expect.any(String) },
    ])
    expect(JSON.stringify(result.diagnostics)).not.toContain("outside-plan.md")
  })

  it("rejects a comment-only negative evidence marker", async () => {
    // Given a real negative assertion neutralized and its marker copied into a comment
    const result = await withCopiedRoot(
      async (root) => {
        await replaceInFile(
          root,
          "tests/authz.test.ts",
          'reason: "scope_denied"',
          'reason: "scope_allowed"',
        )
        await appendToFile(
          root,
          "tests/authz.test.ts",
          '\n// reason: "scope_denied"\nconst commentOnlyMarkerFixture = true\n',
        )
      },
      async (root) => runCommand("requirements", root),
    )

    // Then comment-only text cannot satisfy semantic negative evidence
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "<plan>",
      line: 0,
      rule: "requirements-negative-evidence-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects marker-only evidence for a Must-NOT-have requirement", async () => {
    // Given a disposable copy whose negative test assertion marker is removed
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          "tests/authz.test.ts",
          'reason: "scope_denied"',
          'reason: "scope_allowed"',
        ),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker requires semantic negative test evidence
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "<plan>",
      line: 0,
      rule: "requirements-negative-evidence-missing",
      remediation: expect.any(String),
    })
  })

  it("rejects a plan missing an expected mapped requirement", async () => {
    // Given a disposable plan without the first mapped Must-have bullet
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          ".omo/plans/waha-command-center.md",
          "- A single-tenant, self-hosted, multi-user command center for at least Personal and Business WAHA sessions.\n",
          "",
        ),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker reports the missing mapped requirement
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".omo/plans/waha-command-center.md",
      line: 0,
      rule: "requirements-mapped-missing",
      remediation: expect.any(String),
    })
  })
})
