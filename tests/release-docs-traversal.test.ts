import { readdirSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { openDirectoryNoFollow } from "../scripts/release-docs-traversal.mts"
import {
  appendToFile,
  createDirectoryEntries,
  createDirectoryTree,
  createFile,
  createOutsideFile,
  createSymlink,
  runCommand,
  withCopiedRoot,
} from "./release-checks-test-support"

describe("release documentation traversal", () => {
  it("rejects a normal link that resolves outside the repository root", async () => {
    // Given a disposable copy with a link to a file outside its canonical root
    const result = await withCopiedRoot(
      async (root) => {
        await createOutsideFile(root, "outside.md")
        await appendToFile(root, "README.md", "\n[outside](../outside.md)\n")
      },
      async (root) => runCommand("docs", root),
    )

    // Then the checker fails closed without exposing an absolute path
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "README.md",
      line: expect.any(Number),
      rule: "documentation-link-broken",
      remediation: expect.any(String),
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain("outside.md")
    expect(JSON.stringify(result.diagnostics)).not.toContain("/tmp/")
  })

  it("rejects a link whose target symlink escapes the repository root", async () => {
    // Given a disposable copy with an in-root symlink resolving to a system file
    const result = await withCopiedRoot(
      async (root) => {
        await createSymlink(root, "escaped.md", "/etc/passwd")
        await appendToFile(root, "README.md", "\n[escaped](escaped.md)\n")
      },
      async (root) => runCommand("docs", root),
    )

    // Then the checker rejects the descendant symlink before link scanning
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
    expect(JSON.stringify(result)).not.toContain("escaped.md")
    expect(JSON.stringify(result)).not.toContain("/etc/passwd")
  })

  it("rejects the filesystem root before scanning it", () => {
    // Given the filesystem root as an explicitly unbounded documentation input
    const result = runCommand("docs", "/")

    // Then the checker fails closed with a stable root-only diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
    expect(JSON.stringify(result.diagnostics)).not.toContain("/etc")
  })

  it("closes the owned root descriptor when a child directory cannot be opened", async () => {
    // Given a disposable root and a missing child path that fails during descriptor descent
    const result = await withCopiedRoot(
      async () => {},
      async (root) => {
        const before = readdirSync("/proc/self/fd").length
        for (let attempt = 0; attempt < 20; attempt += 1) {
          expect(() => openDirectoryNoFollow(`${root}/missing-child`)).toThrow()
        }
        const after = readdirSync("/proc/self/fd").length
        return { before, after }
      },
    )

    // Then failed descents do not accumulate owned descriptors
    expect(result.after).toBeLessThanOrEqual(result.before)
  })

  it("skips excluded directory names at any nesting depth", async () => {
    // Given a disposable copy with stale claims below a nested excluded directory
    const result = await withCopiedRoot(
      async (root) => {
        await createFile(
          root,
          "fixtures/node_modules/nested-stale.md",
          "Release status: complete and fully verified.\n",
        )
        await createFile(
          root,
          "fixtures/build/nested-stale.md",
          "Release status: complete and fully verified.\n",
        )
      },
      async (root) => runCommand("docs", root),
    )

    // Then excluded descendants do not affect the documentation result
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toEqual([])
  })

  it("fails closed when one directory exceeds the entry budget", async () => {
    // Given a disposable copy with more entries than the bounded directory scan permits
    const result = await withCopiedRoot(
      (root) => createDirectoryEntries(root, "entry-explosion", 4_097),
      async (root) => runCommand("docs", root),
    )

    // Then enumeration itself fails closed with only the generic redacted diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
  })

  it("fails closed when aggregate directories exceed the shared traversal budget", async () => {
    // Given many small directories whose individual entry counts stay bounded
    const result = await withCopiedRoot(
      (root) => createDirectoryTree(root, [32, 32, 8]),
      async (root) => runCommand("docs", root),
    )

    // Then the shared directory/entry budget bounds total recursive work
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
  })

  it("fails closed before reading an oversized Markdown input", async () => {
    // Given a disposable copy containing a Markdown file beyond the scan limit
    const result = await withCopiedRoot(
      (root) => createFile(root, "oversized.md", `# oversized\n${"x".repeat(4_194_304)}`),
      async (root) => runCommand("docs", root),
    )

    // Then traversal returns only the generic bounded-input diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
  })

  it("fails closed before reading an oversized linked target", async () => {
    // Given a disposable copy with a fragment link to an oversized non-Markdown file
    const result = await withCopiedRoot(
      async (root) => {
        await createFile(root, "large.txt", "x".repeat(4_194_305))
        await appendToFile(root, "README.md", "\n[large target](large.txt#heading)\n")
      },
      async (root) => runCommand("docs", root),
    )

    // Then the checker returns only the generic bounded-input diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
  })

  it("fails closed when fragment-target count is amplified across documents", async () => {
    // Given a disposable copy with more fragment links than the shared target budget permits
    const links = Array.from({ length: 257 }, () => "[target](CONTEXT.md#Core%20concepts)").join(
      "\n",
    )
    const result = await withCopiedRoot(
      (root) => appendToFile(root, "README.md", `\n${links}\n`),
      async (root) => runCommand("docs", root),
    )

    // Then target amplification fails closed without per-link diagnostics
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
  })

  it("fails closed when aggregate fragment-target bytes exceed the shared budget", async () => {
    // Given three bounded targets whose aggregate content exceeds the linked-target budget
    const targetContents = `# heading\n${"x".repeat(3 * 1024 * 1024)}\n`
    const result = await withCopiedRoot(
      async (root) => {
        await createFile(root, "linked-0.txt", targetContents)
        await createFile(root, "linked-1.txt", targetContents)
        await createFile(root, "linked-2.txt", targetContents)
        await appendToFile(
          root,
          "README.md",
          "\n[a](linked-0.txt#heading)\n[b](linked-1.txt#heading)\n[c](linked-2.txt#heading)\n",
        )
      },
      async (root) => runCommand("docs", root),
    )

    // Then aggregate linked-target amplification fails closed generically
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
  })
})
