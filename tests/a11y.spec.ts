import { expect, test } from "./e2e/dashboard-fixture"

test.describe("composer and sent history accessibility", () => {
  test("exposes labelled controls, tooltip relationship, table semantics, and keyboard focus", async ({
    page,
  }) => {
    // Given an authenticated operator dashboard with the Send surface available
    await page.route("**/scoped/sent-history**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "history-a11y",
              sessionId: "session-a11y",
              scope: "personal",
              recipientPhone: "+15550000000",
              snippet80: "Accessible preview",
              scheduledFor: "2026-09-04T10:00:00.000Z",
              createdAt: "2026-09-04T09:59:00.000Z",
              state: "acknowledged",
              providerMessageId: "provider-a11y",
            },
          ],
          page: 1,
          pageSize: 10,
          hasMore: false,
        }),
      }),
    )
    await page.goto("/")
    await page.getByRole("button", { name: /^Send/ }).click()

    // When the operator reaches the composer controls using only the keyboard
    const textarea = page.getByRole("textbox", { name: "Text message" })
    await textarea.focus()
    await textarea.press("Shift+Tab")

    // Then the toolbar and textarea expose names and visible focus order
    await expect(page.getByRole("toolbar", { name: "Message formatting" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Numbered list" })).toBeFocused()
    await expect(textarea).toHaveAttribute("aria-describedby", "message-textarea-help")

    // When the operator focuses an informational control
    const info = page.getByRole("button", { name: "More information" }).first()
    await info.focus()

    // Then the tooltip is linked to its trigger for assistive technology
    const describedBy = await info.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    await expect(page.getByRole("tooltip")).toHaveAttribute("id", describedBy ?? "")

    // Then sent history remains a named table when rows are available
    const history = page.getByRole("table", { name: /sent message history/i })
    await expect(history).toHaveCount(1)
  })
})
