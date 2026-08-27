import { describe, expect, it } from "vitest"

import { appendToFile, runCommand, withCopiedRoot } from "./release-checks-test-support"

describe("release documentation links", () => {
  it("rejects a documentation link that targets a directory", async () => {
    // Given a disposable copy with a local Markdown link targeting a directory
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\n[invalid documentation](docs/#operations)\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker returns a redacted broken-link diagnostic instead of throwing
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-link-broken",
      remediation: expect.any(String),
    })
  })

  it("rejects a missing file link without exposing its target", async () => {
    // Given a disposable copy with a local Markdown link to a missing file
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\n[missing file](docs/missing.md)\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports a redacted broken-link diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-link-broken",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain("missing.md")
  })

  it("validates a file link with a heading fragment", async () => {
    // Given a disposable copy with a file link to an existing heading
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(root, "README.md", "\n[domain glossary](CONTEXT.md#Core%20concepts)\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the existing file and heading are accepted
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it("rejects a missing fragment-only heading in the current document", async () => {
    // Given a disposable copy with a same-document link to a missing heading
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\n[missing section](#missing-heading)\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker reports the source document and hides the link target
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-anchor-broken",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain("missing-heading")
  })

  it("accepts encoded GitHub-style anchors for a local document", async () => {
    // Given a disposable copy with punctuation, whitespace, and an encoded heading link
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(
          root,
          "README.md",
          "\n## Release Notes: Hello, world!\n\n[release notes](#Release%20Notes%3A%20Hello%2C%20world!)\n",
        ),
      async (root) => runCommand("docs", root),
    )

    // Then the normalized heading is accepted
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it("accepts percent-encoded local path components", async () => {
    // Given a disposable copy with a percent-encoded local file path
    const result = await withCopiedRoot(
      (root) =>
        appendToFile(root, "README.md", "\n[domain glossary](CONTEXT%2Emd#Core%20concepts)\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the decoded local file and heading are accepted
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it("rejects malformed encoded local paths without exposing the target", async () => {
    // Given a disposable copy with a malformed percent escape in a local path
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\n[malformed path](CONTEXT%2.md)\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker returns a redacted broken-link diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-link-broken",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain("CONTEXT%2.md")
  })

  it("reports malformed encoded anchors as broken without throwing", async () => {
    // Given a disposable copy with a malformed percent escape in a fragment-only link
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", "\n[malformed](#bad%2)\n"),
      async (root) => runCommand("docs", root),
    )

    // Then the checker returns a stable redacted anchor diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-anchor-broken",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain("bad%2")
  })
})
