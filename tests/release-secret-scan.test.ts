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
  repositoryRoot,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release secret checker", () => {
  it("passes the current repository secret scan", async () => {
    // Given a disposable copy of the checked-in repository with no real secret material
    const result = await withCopiedRoot(
      async () => {},
      async (root) => runCommand("secrets", root),
    )

    // Then the scan passes without exposing content
    expect(result.diagnostics).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it("rejects secret-shaped fixture content in an isolated copy", async () => {
    // Given a disposable copy with synthetic secret-shaped content
    const variable = ["WAHA", "_API_KEY"].join("")
    const secret = ["fixture", "-secret-value"].join("")
    const result = await withCopiedRoot(
      (root) => appendToFile(root, ".env.example", `\n${variable}=${secret}\n`),
      async (root) => runCommand("secrets", root),
    )

    // Then only a redacted path/rule/remediation diagnostic is allowed
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".env.example",
      line: expect.any(Number),
      rule: "secret-value",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it("rejects a private-key header without returning key material", async () => {
    // Given a disposable copy with a synthetic private-key block
    const header = ["-----BEGIN ", "PRIVATE KEY-----"].join("")
    const footer = ["-----END ", "PRIVATE KEY-----"].join("")
    const keyBody = ["synthetic", "-key-body"].join("")
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "docs/threat-model.md", `\n${header}\n${keyBody}\n${footer}\n`),
      async (root) => runCommand("secrets", root),
    )

    // Then the diagnostic identifies only the file, line, rule, and remediation
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "docs/threat-model.md",
      line: expect.any(Number),
      rule: "private-key-block",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain(keyBody)
    expect(JSON.stringify(result)).not.toContain(header)
  })

  it("rejects credential-bearing URLs without returning the URL", async () => {
    // Given a disposable copy with a synthetic credential-bearing URL
    const username = ["fixture", "-user"].join("")
    const password = ["S3cret", "-value-123"].join("")
    const url = `https://${username}:${password}@service.example.invalid/api`
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "docs/operations.md", `\nURL=${url}\n`),
      async (root) => runCommand("secrets", root),
    )

    // Then the diagnostic contains no credential or surrounding source text
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "docs/operations.md",
      line: expect.any(Number),
      rule: "credential-url",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain(username)
    expect(JSON.stringify(result)).not.toContain(password)
    expect(JSON.stringify(result)).not.toContain(url)
  })

  it("allows the repository's exact safe placeholder forms", async () => {
    // Given a disposable copy using only documented placeholder forms
    const content = [
      "SAFE_API_KEY=example.invalid",
      "SAFE_TOKEN=replace-me",
      ["SAFE_PASSWORD=", ["$", "{SAFE_PASSWORD}"].join("")].join(""),
      "SAFE_SECRET=<redacted>",
      "SAFE_ENCRYPTION_KEY=REDACTED",
      "DATABASE_URL=postgresql://app:replace-me@postgres:5432/example",
    ].join("\n")
    const result = await withCopiedRoot(
      (root) => appendToFile(root, ".env.example", `\n${content}\n`),
      async (root) => runCommand("secrets", root),
    )

    // Then placeholders do not create findings
    expect(result.diagnostics).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it("redacts traversal failures for a non-directory root", async () => {
    // Given a disposable copy whose file is supplied as the scan root
    const result = await withCopiedRoot(
      async () => {},
      async (root) =>
        runReleaseCheck(["secrets", "--root", join(root, ".env.example")], repositoryRoot),
    )

    // Then the checker returns only a generic validation diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "secret-scan-input",
        remediation: expect.any(String),
      },
    ])
    expect(JSON.stringify(result.diagnostics)).not.toContain(".env.example")
    expect(JSON.stringify(result.diagnostics)).not.toContain("ENOTDIR")
  })

  it("rejects comment-prefixed secret assignments while allowing safe placeholders", async () => {
    // Given a disposable environment file with a commented unsafe assignment and safe comment
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          ".env.example",
          "\n# COMMENT_API_KEY=comment-secret-fixture\n# SAFE_TOKEN=example.invalid\n",
        ),
      async (root) => runCommand("secrets", root),
    )

    // Then only the unsafe comment is rejected without returning its value
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: ".env.example",
      line: expect.any(Number),
      rule: "secret-value",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain("comment-secret-fixture")
  })

  it.each(["root", "descendant"])("rejects %s symlinks", async (location) => {
    // Given a disposable repository with a symlink at the scan root or below it
    const result = await withCopiedRoot(
      async (root) => {
        if (location === "root") {
          await createSymlink(root, "../relaynest-secret-root-link", root)
          return
        }
        await createSymlink(root, "fixtures/secret-link", "/etc")
      },
      async (root) => {
        const scanRoot =
          location === "root" ? join(dirname(root), "relaynest-secret-root-link") : root
        return runReleaseCheck(["secrets", "--root", scanRoot], repositoryRoot)
      },
    )

    // Then traversal is rejected with a redacted root diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics[0]?.rule).toBe("secret-scan-input")
    expect(JSON.stringify(result.diagnostics)).not.toContain("secret-link")
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
  ])("fails closed for %s bounded secret input", async (_name, createInput) => {
    // Given a disposable repository exceeding one bounded traversal resource
    const result = await withCopiedRoot(createInput, async (root) => runCommand("secrets", root))

    // Then the scan returns only its generic bounded-input diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      { path: "<root>", line: 0, rule: "secret-scan-input", remediation: expect.any(String) },
    ])
  })
})
