import { describe, expect, it } from "vitest"

import { MAX_LOCAL_LINKS } from "../scripts/release-docs-links.mts"

import { appendToFile, createFile, runCommand, withCopiedRoot } from "./release-checks-test-support"

describe("release documentation link budget", () => {
  it("fails closed when ordinary local Markdown links exceed the global link budget", async () => {
    // Given a disposable root with more ordinary local links than the global bounded-resource limit
    const result = await withCopiedRoot(
      async (root) => {
        await createFile(root, "fixtures/ordinary-link-target.md", "# ordinary link target\n")
        await appendToFile(
          root,
          "README.md",
          `\n${Array.from(
            { length: MAX_LOCAL_LINKS + 1 },
            (_, index) => `[ordinary-${index}](fixtures/ordinary-link-target.md)`,
          ).join("\n")}\n`,
        )
      },
      async (root) => runCommand("docs", root),
    )

    // Then the checker returns only the deterministic redacted input-limit diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toEqual([
      {
        path: "<root>",
        line: 0,
        rule: "documentation-scan-input",
        remediation: expect.any(String),
      },
    ])
    expect(JSON.stringify(result.diagnostics)).not.toContain("ordinary-link-target.md")
  })
})
