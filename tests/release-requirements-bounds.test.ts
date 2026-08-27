import { describe, expect, it } from "vitest"

import { MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "../scripts/release-fs.mts"
import { createFile, runCommand, withCopiedRoot } from "./release-checks-test-support"

describe("release requirements input bounds", () => {
  it.each([
    ["oversized", MAX_FILE_BYTES + 1, "requirements-file-read"],
    ["aggregate oversized", MAX_TOTAL_BYTES + 1, "requirements-file-read"],
  ])("rejects an %s plan input", async (_name, size, rule) => {
    // Given a disposable plan input over the bounded file contract
    const result = await withCopiedRoot(
      (root) => createFile(root, ".omo/plans/waha-command-center.md", "x".repeat(size)),
      async (root) => runCommand("requirements", root),
    )

    // Then the checker fails closed with a redacted input diagnostic
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics).toContainEqual({
      path: "<root>",
      line: 0,
      rule,
      remediation: expect.any(String),
    })
  })
})
