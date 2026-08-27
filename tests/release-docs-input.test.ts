import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { createSymlink, runCommand, withCopiedRoot } from "./release-checks-test-support"

describe("release documentation input boundaries", () => {
  it("rejects a symlinked documentation root", async () => {
    // Given a symlink outside the copied root that targets the copied repository
    const result = await withCopiedRoot(
      async (root) => {
        await createSymlink(root, "../documentation-root-link", root)
      },
      async (root) => runCommand("docs", join(dirname(root), "documentation-root-link")),
    )

    // Then the checker rejects the root without exposing the link path
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
    expect(JSON.stringify(result.diagnostics)).not.toContain("documentation-root-link")
  })

  it("rejects a descendant symlink before exclusion checks", async () => {
    // Given a non-excluded documentation descendant symlink
    const result = await withCopiedRoot(
      (root) => createSymlink(root, "documentation-link", "/etc"),
      async (root) => runCommand("docs", root),
    )

    // Then traversal fails closed without exposing the symlink name
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
    expect(JSON.stringify(result.diagnostics)).not.toContain("documentation-link")
  })
})
