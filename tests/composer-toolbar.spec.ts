import { expect, test } from "@playwright/test"

test.describe("message composer toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "operator@example.test",
            displayName: "Operator",
            rolesByScope: { personal: ["operator"] },
          },
        }),
      }),
    )
    await page.route("**/scoped/sessions**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    )
    await page.route("**/scoped/analytics**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    )
    await page.goto("/")
    await page.getByRole("button", { name: /^Send/ }).click()
  })

  test("wraps selected text with Bold and updates the preview", async ({ page }) => {
    // Given the Send composer contains selected message text
    const textarea = page.getByRole("textbox", { name: "Text message" })
    await textarea.fill("hello")
    await textarea.selectText()

    // When the operator clicks the Bold toolbar control
    await page.getByRole("button", { name: "Bold" }).click()

    // Then the source is wrapped and the preview renders the formatted text
    await expect(textarea).toHaveValue("*hello*")
    await expect(page.locator(".message-preview-content strong")).toHaveText("hello")
  })

  test("reaches the toolbar by keyboard and keeps insertion focused", async ({ page }) => {
    // Given the textarea is focused with no selected text
    const textarea = page.getByRole("textbox", { name: "Text message" })
    await textarea.focus()

    // When the operator tabs backward into the toolbar and activates Bold
    await textarea.press("Shift+Tab")
    await expect(page.getByRole("button", { name: "Numbered list" })).toBeFocused()
    if (process.env.COMPOSER_QA === "1")
      await page.screenshot({ path: "/tmp/qa-t6.png", fullPage: true })
    await page.getByRole("button", { name: "Bold" }).focus()
    await page.getByRole("button", { name: "Bold" }).click()

    // Then the empty formatting pair is inserted and editing returns to the textarea
    await expect(textarea).toHaveValue("**")
    await expect(textarea).toBeFocused()
  })
})
