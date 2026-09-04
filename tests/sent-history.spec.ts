import { expect, test } from "@playwright/test"

test.describe("sent history", () => {
  test("shows a direct send, paginates, and clears when scope changes", async ({ page }) => {
    // Given an operator with one session in each account scope
    let sent = false
    await page.route("**/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "operator@example.test",
            displayName: "Operator",
            rolesByScope: { personal: ["operator"], business: ["operator"] },
          },
        }),
      }),
    )
    await page.route("**/scoped/sessions**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "00000000-0000-4000-8000-000000000010",
            accountScope: "personal",
            name: "Personal WA",
            status: "WORKING",
            serviceHealth: "healthy",
            sendingReadiness: "ready",
          },
        ]),
      }),
    )
    await page.route("**/scoped/analytics**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    )
    await page.route(/\/scoped\/sessions\/[^/]+\/chats/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    )
    await page.route(/\/scoped\/sessions\/[^/]+\/contact\?scope=/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-000000000020",
          phone: "+15551234567",
          displayName: "Test recipient",
          consentGranted: true,
          optedOut: false,
        }),
      }),
    )
    await page.route(/\/contacts\/[^/]+\/consent\?scope=/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"updated":true}' }),
    )
    await page.route("**/messages/schedules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    )
    await page.route(/\/messages\/immediate\?scope=/, async (route) => {
      sent = true
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ state: "acknowledged", providerMessageId: "provider-123" }),
      })
    })
    await page.route("**/scoped/sent-history**", async (route) => {
      const requestUrl = new URL(route.request().url())
      const scope = requestUrl.searchParams.get("scope")
      const currentPage = Number(requestUrl.searchParams.get("page"))
      const items =
        scope === "personal" && sent
          ? [
              {
                id: `history-${currentPage}-one`,
                sessionId: "00000000-0000-4000-8000-000000000010",
                scope: "personal",
                recipientPhone: "+15551234567",
                snippet80: currentPage === 1 ? "Hello <operator>" : "Second page",
                scheduledFor: "2026-09-04T10:00:00.000Z",
                createdAt: "2026-09-04T09:59:00.000Z",
                state: "acknowledged",
                providerMessageId: "provider-123456789012345678901234",
              },
              ...(currentPage === 1
                ? [
                    {
                      id: "history-1-two",
                      sessionId: "00000000-0000-4000-8000-000000000010",
                      scope: "personal",
                      recipientPhone: "+15557654321",
                      snippet80: "Second row",
                      scheduledFor: "2026-09-04T09:00:00.000Z",
                      createdAt: "2026-09-04T08:59:00.000Z",
                      state: "submitted",
                      providerMessageId: null,
                    },
                  ]
                : []),
            ]
          : []
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items, page: currentPage, pageSize: 1, hasMore: currentPage === 1 }),
      })
    })

    await page.goto("/")
    await page.getByRole("button", { name: /^Send/ }).click()

    // When the operator verifies a recipient and submits an immediate text
    await page.getByLabel("Authorized session").selectOption("00000000-0000-4000-8000-000000000010")
    await page.getByLabel("One recipient").fill("+15551234567")
    await page.getByRole("button", { name: "Resolve target" }).click()
    await expect(page.getByText("Contact verified")).toBeVisible()
    await page.getByLabel(/documented consent basis/).check()
    await page.getByLabel("Text message").fill("Hello <operator>")
    await page.getByRole("button", { name: "Submit immediate text" }).click()

    // Then the new row is visible, unsafe markup remains text, and pagination works
    await expect(page.getByRole("cell", { name: "+15551234567" })).toBeVisible()
    await expect(page.getByRole("cell", { name: "Hello <operator>" })).toBeVisible()
    await expect(page.getByText("acknowledged", { exact: true })).toBeVisible()
    if (process.env.T5_QA === "1") {
      await page.screenshot({ path: "/tmp/qa-t5.png", fullPage: true })
    }
    await page.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("cell", { name: "Second page" })).toBeVisible()

    // When the operator switches scope
    await page.getByLabel("Account scope").selectOption("business")

    // Then the prior scope's history is cleared and no personal row leaks
    await expect(page.getByText("No sent messages")).toBeVisible()
    await expect(page.getByRole("cell", { name: "+15551234567" })).toHaveCount(0)
  })
})
