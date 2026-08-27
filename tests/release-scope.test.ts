import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

import { runReleaseCheck } from "../scripts/release-checks.mts"
import { MAX_DEPTH, MAX_DIRECTORY_ENTRIES, MAX_FILE_BYTES } from "../scripts/release-fs.mts"
import {
  appendToFile,
  createDirectoryEntries,
  createDirectoryTree,
  createFile,
  createSymlink,
  replaceInFile,
  repositoryRoot,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release scope checker", () => {
  it("passes the current repository scope scan", async () => {
    // Given a disposable copy of the checked-in repository's documented Personal/Business boundaries
    const result = await withCopiedRoot(
      async () => {},
      async (root) => runCommand("scope", root),
    )

    // Then scope separation is reported as clean
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it("rejects a cross-scope boundary fixture in an isolated copy", async () => {
    // Given a disposable copy with a deliberately mixed account-scope marker
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          "CONTEXT.md",
          "\nPersonal and Business scopes are interchangeable here.\n",
        ),
      async (root) => runCommand("scope", root),
    )

    // Then the checker identifies the scope rule without returning source content
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "CONTEXT.md",
      line: expect.any(Number),
      rule: "scope-separation",
      remediation: expect.any(String),
    })
  })

  it("rejects a multiline JSON account scope mismatch", async () => {
    // Given a disposable copy with canonical accountScope and sessionScope separated across lines
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          "apps/api/src/auth/authorization.ts",
          'if (input.accountScope !== input.sessionScope) return { allowed: false, reason: "scope_denied" }',
          'const scopeFixture = {\n  "accountScope": "personal",\n  "sessionScope": "business"\n}\nvoid scopeFixture',
        ),
      async (root) => runCommand("scope", root),
    )

    // Then the checker reports the mismatch at the first canonical scope marker
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "apps/api/src/auth/authorization.ts",
      line: 31,
      rule: "scope-mismatch",
      remediation: expect.any(String),
    })
  })

  it("fails closed when the canonical accountScope contract is neutralized", async () => {
    // Given a disposable copy with the authoritative cross-scope denial marker removed
    const result = await withCopiedRoot(
      (root) =>
        replaceInFile(
          root,
          "apps/api/src/auth/authorization.ts",
          'if (input.accountScope !== input.sessionScope) return { allowed: false, reason: "scope_denied" }',
          'if (input.accountScope === input.sessionScope) return { allowed: false, reason: "scope_denied" }',
        ),
      async (root) => runCommand("scope", root),
    )

    // Then the checker reports the missing positive scope contract
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "apps/api/src/auth/authorization.ts",
      line: 0,
      rule: "scope-contract-missing",
      remediation: expect.any(String),
    })
  })

  it.each(["root", "descendant"])("rejects %s symlinks", async (location) => {
    // Given a disposable repository with a symlink at the scan root or below it
    const result = await withCopiedRoot(
      async (root) => {
        if (location === "root") {
          await createSymlink(root, "../relaynest-scope-root-link", root)
          return
        }
        await createSymlink(root, "fixtures/scope-link", "/etc")
      },
      async (root) => {
        const scanRoot =
          location === "root" ? join(dirname(root), "relaynest-scope-root-link") : root
        return runReleaseCheck(["scope", "--root", scanRoot], repositoryRoot)
      },
    )

    // Then traversal is rejected with a redacted root diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics[0]?.rule).toBe("scope-scan-input")
    expect(JSON.stringify(result.diagnostics)).not.toContain("scope-link")
  })

  it.each([
    ["deep", async (root: string) => createDirectoryTree(root, Array(MAX_DEPTH + 2).fill(1))],
    [
      "wide",
      async (root: string) => createDirectoryEntries(root, "wide", MAX_DIRECTORY_ENTRIES + 1),
    ],
    [
      "oversized",
      async (root: string) => createFile(root, "oversized.txt", "x".repeat(MAX_FILE_BYTES + 1)),
    ],
  ])("fails closed for %s bounded scope input", async (_name, createInput) => {
    // Given a disposable repository exceeding one bounded traversal resource
    const result = await withCopiedRoot(createInput, async (root) => runCommand("scope", root))

    // Then the scan returns only its generic bounded-input diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      { path: "<root>", line: 0, rule: "scope-scan-input", remediation: expect.any(String) },
    ])
  })
})
