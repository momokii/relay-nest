import { describe, expect, it } from "vitest"

import { workspaceConfig } from "../packages/config/src/index"

describe("workspace configuration", () => {
  it("exposes the configured runtime contract", () => {
    // Given the workspace configuration boundary
    // When the shared configuration is imported
    // Then it exposes a typed environment name and WAHA URL
    expect(workspaceConfig.appEnv).toBe("test")
    expect(workspaceConfig.wahaBaseUrl).toBe("http://waha.internal")
  })
})
