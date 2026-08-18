import { readFile } from "node:fs/promises"

import { authCredentialsPath, bootstrapOrLogin, e2eAuthCredentialsSchema } from "./auth-fixture"
import { expect, test } from "./dashboard-fixture"

test.describe("authenticated dashboard shell", () => {
  test("uses seeded sessions and keeps unavailable AI suggestions honest", async ({
    page,
    seed,
  }) => {
    // Given the global setup supplied authenticated storage state and seed metadata
    const authMe = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/auth/me",
    )
    const personalSessions = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/scoped/sessions" &&
        new URL(response.url()).searchParams.get("scope") === "personal",
    )
    await page.goto("/")

    // Then the authenticated dashboard is rendered without AuthBoundary or preview data
    expect((await authMe).status()).toBe(200)
    expect((await personalSessions).status()).toBe(200)
    await expect(page.getByRole("heading", { name: "Operational overview" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Sign in to RelayNest" })).toHaveCount(0)
    await expect(page.getByText("Live data boundary")).toBeVisible()

    // When the operator opens text sending and changes the account scope
    await page.getByRole("button", { name: "Send" }).click()
    await expect(page.getByRole("heading", { name: "Immediate text" })).toBeVisible()
    await expect(page.locator("#message-session")).toHaveValue(seed.personal.id)
    const businessSessions = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/scoped/sessions" &&
        new URL(response.url()).searchParams.get("scope") === "business",
    )
    await page.getByLabel("Account scope").selectOption("business")

    // Then Business contains only its own seeded session
    expect((await businessSessions).status()).toBe(200)
    await expect(page.getByText("Current boundary")).toBeVisible()
    await expect(page.locator("#message-session")).toHaveValue(seed.business.id)
    await expect(page.locator("#message-session")).not.toHaveValue(seed.personal.id)

    // Then AI suggestions remain honest until a server-backed suggestion exists
    await expect(page.getByText("AI suggestions unavailable", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Approve for separate review" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Submit immediate text" })).toBeVisible()
  })

  test("creates, edits, and cancels a persisted Personal schedule without dispatch", async ({
    page,
    seed,
  }) => {
    // Given the authenticated Personal session list has loaded
    let dispatchRequests = 0
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/sendText") dispatchRequests += 1
    })
    await page.goto("/")
    const scheduleList = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === `/scoped/sessions/${seed.personal.id}/messages/schedules` &&
        url.searchParams.get("scope") === "personal" &&
        response.request().method() === "GET"
      )
    })
    await page.getByRole("button", { name: "Schedule" }).click()

    // Then the browser receives the backend-backed list
    expect((await scheduleList).status()).toBe(200)
    await expect(page.getByRole("heading", { name: "One-time scheduling" })).toBeVisible()

    // When a complete message omits consent
    await page.getByLabel("Recipient phone number").fill(seed.recipientPhone)
    await page.getByLabel("Text message").fill("A deterministic acceptance message")
    await page.getByRole("button", { name: "Create one-time schedule" }).click()

    // Then client validation blocks the request before it can reach the provider
    await expect(page.getByRole("alert")).toContainText("consent")

    // When a valid future schedule reaches the disposable loopback provider boundary
    await page.getByLabel("I have a valid consent basis for this individual recipient.").check()
    await page.getByLabel("One-time dispatch time").fill("2099-01-01T12:00")
    const scheduleCreate = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === `/scoped/sessions/${seed.personal.id}/messages/schedule` &&
        url.searchParams.get("scope") === "personal" &&
        response.request().method() === "POST"
      )
    })
    await page.getByRole("button", { name: "Create one-time schedule" }).click()

    // Then the real API persists a scheduled job without claiming provider delivery
    const createdResponse = await scheduleCreate
    const createdBody = await createdResponse.text()
    expect(createdResponse.status(), createdBody).toBe(200)
    const created = JSON.parse(createdBody)
    expect(created).toMatchObject({ state: "scheduled" })
    expect(created.jobId).toMatch(/[0-9a-f-]{36}/)
    expect(dispatchRequests).toBe(0)

    // When the dashboard discovers the persisted job after a fresh navigation
    await page.reload()
    const persistedList = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === `/scoped/sessions/${seed.personal.id}/messages/schedules` &&
        url.searchParams.get("scope") === "personal" &&
        response.request().method() === "GET"
      )
    })
    await page.getByRole("button", { name: "Schedule" }).click()
    expect((await persistedList).status()).toBe(200)
    await expect(page.getByRole("combobox", { name: "Schedule" })).toHaveCount(1)
    await expect(page.getByText("State · scheduled", { exact: true })).toBeVisible()
    const scheduleDetail = page.locator(".schedule-detail")
    await expect(scheduleDetail.getByLabel("Scheduled for")).toHaveValue(/2099/)
    await expect(scheduleDetail.getByLabel("Timezone")).toHaveValue("UTC")

    // When the operator edits the persisted schedule through the same-origin API
    const editResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.match(
          new RegExp(`/scoped/sessions/${seed.personal.id}/messages/schedules/[0-9a-f-]{36}`),
        ) !== null && response.request().method() === "PUT",
    )
    await scheduleDetail.getByLabel("Scheduled for").fill("2099-01-02T12:00:00.000Z")
    await page.getByRole("button", { name: "Save schedule" }).click()
    const edited = await editResponse
    expect(edited.status()).toBe(200)
    expect(edited.request().headers()["x-csrf-token"]).toBeTruthy()
    expect(new URL(edited.url()).origin).toBe(new URL(page.url()).origin)
    expect(await edited.json()).toMatchObject({
      state: "scheduled",
      scheduledFor: "2099-01-02T12:00:00.000Z",
      timezone: "UTC",
      providerMessageId: null,
    })
    await expect(scheduleDetail.getByLabel("Scheduled for")).toHaveValue("2099-01-02T12:00:00.000Z")
    expect(dispatchRequests).toBe(0)

    // When the operator cancels the persisted schedule through the same-origin API
    const cancelResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/cancel") &&
        response.request().method() === "POST",
    )
    await page.getByRole("button", { name: "Cancel schedule" }).click()
    const cancelled = await cancelResponse
    expect(cancelled.status()).toBe(200)
    expect(cancelled.request().headers()["x-csrf-token"]).toBeTruthy()
    expect(new URL(cancelled.url()).origin).toBe(new URL(page.url()).origin)
    expect(await cancelled.json()).toMatchObject({
      state: "cancelled",
      providerMessageId: null,
      recoveryCode: null,
      failureCode: null,
    })
    expect(dispatchRequests).toBe(0)

    // Then Business cannot see the Personal schedule
    const businessList = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === `/scoped/sessions/${seed.business.id}/messages/schedules` &&
        url.searchParams.get("scope") === "business" &&
        response.request().method() === "GET"
      )
    })
    await page.getByLabel("Account scope").selectOption("business")
    const businessSchedules = await businessList
    expect(businessSchedules.status()).toBe(200)
    expect(await businessSchedules.json()).toEqual([])
    await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Schedule" })).toHaveCount(0)
    await expect(page.getByText("No schedules", { exact: true })).toBeVisible()
  })

  test("logs out through the authenticated dashboard action", async ({ browser }) => {
    const credentials = e2eAuthCredentialsSchema.parse(
      JSON.parse(await readFile(authCredentialsPath, "utf8")),
    )
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
      storageState: { cookies: [], origins: [] },
    })
    await bootstrapOrLogin(context.request, credentials)
    const page = await context.newPage()

    try {
      // Given an authenticated dashboard with a visible sign-out action
      await page.goto("/")
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()

      // When the user signs out
      const logout = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/auth/logout" &&
          response.request().method() === "POST",
      )
      await page.getByRole("button", { name: "Sign out" }).click()

      // Then the session is revoked and the authentication boundary returns
      expect((await logout).status()).toBe(204)
      await expect(page.getByRole("heading", { name: "Sign in to RelayNest" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test("preserves one-time schedule validation copy and mobile drawer focus", async ({ page }) => {
    // Given the authenticated dashboard is rendered at the compact breakpoint
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto("/")
    const menuButton = page.getByRole("button", { name: "Menu" })
    const navigation = page.locator("#primary-navigation")

    // Then a closed drawer is hidden from assistive technology and keyboard navigation
    await expect(navigation).toHaveAttribute("aria-hidden", "true")
    await expect(navigation).toHaveAttribute("inert", "")

    // When the user opens the drawer, visits scheduling, and closes it with Escape
    await menuButton.click()
    await expect(navigation).not.toHaveAttribute("inert")
    await page.getByRole("button", { name: "Schedule" }).click()
    await expect(page.getByRole("heading", { name: "One-time scheduling" })).toBeVisible()
    await menuButton.click()
    await page.keyboard.press("Escape")

    // Then focus returns to the trigger and the one-time boundary remains visible
    await expect(navigation).toHaveAttribute("aria-hidden", "true")
    await expect(navigation).toHaveAttribute("inert", "")
    await expect(menuButton).toBeFocused()
    await expect(page.getByText("recurrence is not available")).toBeVisible()
    await expect(page.getByText("media or broadcast targets")).toBeVisible()
  })

  test("exercises authenticated notification settings, test, and history states", async ({
    page,
  }) => {
    // Given the authenticated Admin notification page
    await page.goto("/")
    const settings = page.getByRole("button", { name: "Notifications" })
    await settings.click()
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save provider settings" })).toBeVisible()

    // When disabled provider settings are saved through the authenticated API
    await page.getByLabel("Email host").fill("smtp.example.invalid")
    await page.getByLabel("Email username").fill("disabled-user")
    await page.getByLabel("Email password").fill("not-a-provider-secret")
    await page.getByLabel("Email from").fill("e2e@example.invalid")
    await page.getByLabel("Telegram bot token").fill("disabled-token")
    await page.getByLabel("Telegram chat IDs").fill("disabled-chat")
    const saveSettings = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/admin/notifications/personal/settings" &&
        response.request().method() === "PUT",
    )
    await page.getByRole("button", { name: "Save provider settings" }).click()

    // Then the API accepts safe disabled settings without exposing provider credentials
    expect((await saveSettings).status()).toBe(200)
    await expect(page.getByText("Settings saved", { exact: true })).toBeVisible()

    // When preferences and an operations test are requested
    const savePreferences = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/admin/notifications/personal/preferences" &&
        response.request().method() === "PUT",
    )
    await page.getByRole("button", { name: "Save operations preferences" }).click()
    expect((await savePreferences).status()).toBe(204)

    const notificationTest = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/admin/notifications/personal/test" &&
        response.request().method() === "POST",
    )
    await page.getByRole("button", { name: "Send operations test" }).click()

    // Then disabled channels are reported as disabled, not as delivered
    expect((await notificationTest).status()).toBe(200)
    await expect(page.getByText("Test completed", { exact: true })).toBeVisible()
    await expect(page.getByText("Email: disabled; Telegram: disabled.")).toBeVisible()

    // When failure history is reloaded
    const history = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/admin/notifications/personal/history" &&
        response.request().method() === "GET",
    )
    await page.getByRole("button", { name: "Reload failure history" }).click()

    // Then the backend-backed history request completes without claiming delivery
    expect((await history).status()).toBe(200)
    await expect(page.getByRole("button", { name: "Reload failure history" })).toBeVisible()
  })

  test("requires retention preview before cancel or confirm and completes the scoped purge", async ({
    page,
  }) => {
    // Given the authenticated Admin retention page
    await page.goto("/")
    await page.getByRole("button", { name: "Retention" }).click()
    await expect(page.getByRole("heading", { name: "Retention" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Confirm selected purge" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Cancel preview" })).toHaveCount(0)

    // When the Admin requests a Personal messages preview
    const preview = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/admin/retention/personal/preview" &&
        response.request().method() === "POST",
    )
    await page.getByRole("button", { name: "Preview before purge" }).click()

    // Then the server supplies the confirmation data and both gates appear
    expect((await preview).status()).toBe(200)
    await expect(page.getByText("Preview ready", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Confirm selected purge" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Cancel preview" })).toBeVisible()

    // When the Admin cancels the first preview
    await page.getByRole("button", { name: "Cancel preview" }).click()

    // Then no stale preview can be confirmed
    await expect(page.getByText("Preview ready", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Confirm selected purge" })).toHaveCount(0)

    // When a fresh preview is explicitly confirmed
    await page.getByRole("button", { name: "Preview before purge" }).click()
    await expect(page.getByRole("button", { name: "Confirm selected purge" })).toBeVisible()
    const purge = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/admin/retention/personal/purge" &&
        response.request().method() === "POST",
    )
    await page.getByRole("button", { name: "Confirm selected purge" }).click()

    // Then the authenticated backend completes the confirmed scoped operation
    expect((await purge).status()).toBe(200)
    await expect(page.getByText("Purge completed", { exact: true })).toBeVisible()
  })

  test("keeps Admin controls visible without exposing access records", async ({ page }) => {
    // Given the authenticated Admin access page
    await page.goto("/")
    await page.getByRole("button", { name: "Users" }).click()

    // Then supported Admin controls and unsupported record views are explicit
    await expect(page.getByRole("heading", { name: "Create a user" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Grant a session" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Disable a user" })).toBeVisible()
    await expect(page.getByText("No safe list or revoke route")).toBeVisible()
    await expect(page.getByRole("button", { name: "Create user" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Grant session access" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Disable user" })).toBeVisible()
  })

  test("keeps session lifecycle commands confirmation-gated and provider outcomes explicit", async ({
    page,
    seed,
  }) => {
    // Given the dashboard has one authorized seeded session in the selected scope
    await page.goto("/")
    await page.getByRole("button", { name: "Sessions" }).click()
    await expect(page.getByLabel("Authorized session")).toHaveValue(seed.personal.id)

    // Then destructive lifecycle commands require explicit confirmation
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Restart", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled()

    // When the Admin confirms and submits a provider-dependent restart
    await page.getByRole("checkbox", { name: /Confirm destructive/ }).check()
    await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeEnabled()
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeEnabled()
    const restart = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/scoped/sessions/${seed.personal.id}/lifecycle` &&
        response.request().method() === "POST",
    )
    await page.getByRole("button", { name: "Restart", exact: true }).click()

    // Then provider unavailability is shown without claiming a successful restart
    expect((await restart).status()).toBe(502)
    await expect(
      page.getByText("WAHA or this capability is unavailable.", { exact: true }),
    ).toBeVisible()

    // When persisted status history is requested
    const history = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/scoped/sessions/${seed.personal.id}/status-history` &&
        response.request().method() === "GET",
    )
    await page.getByRole("button", { name: "Load status history" }).click()

    // Then the real empty backend result remains distinct from provider success
    expect((await history).status()).toBe(200)
    await expect(page.getByText("No status history", { exact: true })).toBeVisible()
  })
})
