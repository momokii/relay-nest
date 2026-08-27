import { describe, expect, it } from "vitest"

import {
  appendToFile,
  replaceInFile,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release documentation fenced links", () => {
  it("does not accept headings inside fenced code blocks", async () => {
    // Given a disposable copy with a fake heading inside a fenced code block
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          "README.md",
          ["", "```", "# Fake heading", "```", "", "[fake heading](#Fake%20heading)", ""].join(
            "\n",
          ),
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the anchor is rejected because the target has no real heading
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-anchor-broken",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain("Fake heading")
  })

  it("does not accept headings inside tilde-fenced code blocks", async () => {
    // Given a disposable copy with a fake heading inside a tilde-fenced block
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          "README.md",
          [
            "",
            "~~~markdown",
            "# Tilde fake heading",
            "~~~",
            "",
            "[fake](#Tilde%20fake%20heading)",
            "",
          ].join("\n"),
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the anchor is rejected because the target has no real heading
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-anchor-broken",
      remediation: expect.any(String),
    })
  })

  it.each([
    ["backtick", "```text", "```not-a-closer", "```"],
    ["tilde", "~~~text", "~~~not-a-closer", "~~~"],
    ["mixed", "```text", "```~~~", "```"],
  ])(
    "keeps a %s fence open for a closer with trailing text",
    async (_name, opening, invalidCloser, closing) => {
      // Given a valid fenced block containing a same-character marker with trailing text
      const result = await withCopiedRoot(
        (root) =>
          appendToFile(
            root,
            "README.md",
            [
              "",
              opening,
              invalidCloser,
              "# Fake heading",
              closing,
              "",
              "[fake](#Fake%20heading)",
              "",
            ].join("\n"),
          ),
        async (root) => runCommand("docs", root),
      )

      // Then the later anchor remains missing because the fenced heading stays masked
      expect(result.exitCode).toBe(1)
      expect(result.diagnostics).toContainEqual({
        path: "README.md",
        line: expect.any(Number),
        rule: "documentation-anchor-broken",
        remediation: expect.any(String),
      })
    },
  )

  it("does not satisfy a required marker from inside a fenced example", async () => {
    // Given a required README marker removed from prose and repeated only in a code example
    const result = await withCopiedRoot(
      async (root) => {
        await replaceInFile(root, "README.md", "## Source of truth", "## Changed source")
        await appendToFile(root, "README.md", "\n```text\nSource of truth\n```\n")
      },
      async (root) => runCommand("docs", root),
    )

    // Then the documentation marker remains missing
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: 0,
      rule: "documentation-marker-missing",
      remediation: expect.any(String),
    })
  })

  it("preserves source lines after fenced code-block masking", async () => {
    // Given a disposable copy with a long ignored code block before stale guidance
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          "README.md",
          [
            "",
            "test fixture",
            "test fixture",
            "test fixture",
            "",
            "```",
            `${"x".repeat(300)} [ignored](missing.md)`,
            "```",
            "",
            "Release status: complete and fully verified.",
            "",
          ].join("\n"),
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the stale claim retains its original physical line number
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: 105,
      rule: "documentation-freshness",
      remediation: expect.any(String),
    })
  })
})
