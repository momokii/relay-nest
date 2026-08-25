import { describe, expect, it } from "vitest"

import { notificationSettingsForScope } from "../apps/web/src/components/notification-settings-form"
import { scopeRequestIsCurrent } from "../apps/web/src/dashboard-controller"

const personalSettings = {
  accountScope: "personal" as const,
  email: { enabled: true, configured: true, host: "personal.invalid" },
  telegram: { enabled: false, configured: false, chatIds: [] },
}

describe("Todo 14 stale scope regressions", () => {
  it("rejects a session refresh token after the account scope changes", () => {
    // Given a session-create request from the previous Personal generation
    const staleRequest = { scope: "personal" as const, generation: 1 }

    // When the current dashboard is Business generation 2
    const isCurrent = scopeRequestIsCurrent("business", 2, staleRequest)

    // Then the in-flight Personal result cannot populate Business state
    expect(isCurrent).toBe(false)
  })

  it("accepts only notification settings declared for the current scope", () => {
    // Given notification settings returned for Personal
    const settings = notificationSettingsForScope(personalSettings, "business")

    // When the settings are considered for the Business form
    // Then the previous-scope settings are absent before the first render
    expect(settings).toBeUndefined()
  })
})
