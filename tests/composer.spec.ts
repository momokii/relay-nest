import { writeFile } from "node:fs/promises"

import { expect, test } from "@playwright/test"

test.describe("message composer formatting", () => {
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

  test("wraps selected text with Ctrl+B and renders strong preview", async ({ page }) => {
    // Given the Send composer with an empty textarea
    const textarea = page.getByRole("textbox", { name: "Text message" })

    // When the operator types text, selects it, and presses Ctrl+B
    await textarea.fill("hello")
    await textarea.press("Control+a")
    await textarea.press("Control+b")

    // Then the source text is wrapped and the preview renders strong text
    await expect(textarea).toHaveValue("*hello*")
    await expect(page.getByLabel("Message preview")).toContainText("hello")
    await expect(page.locator(".message-preview-content strong")).toHaveText("hello")
    if (process.env.COMPOSER_QA === "1")
      await page.screenshot({ path: "/tmp/qa-t3.png", fullPage: true })
  })

  test("inserts a newline when Enter is pressed", async ({ page }) => {
    // Given the composer contains the first line
    const textarea = page.getByRole("textbox", { name: "Text message" })
    await textarea.fill("hello")

    // When the operator presses Enter and types a second line
    await textarea.press("End")
    await textarea.press("Enter")
    await textarea.type("world")

    // Then the textarea source preserves the newline
    await expect(textarea).toHaveValue("hello\nworld")
    await page.screenshot({ path: "/tmp/qa-fix3-composer-enter.png", fullPage: true })
    await writeFile(
      "/tmp/qa-fix3-composer-enter.txt",
      JSON.stringify({ value: await textarea.inputValue(), submitted: false }, null, 2),
    )
  })

  test("inserts a bullet list marker at the caret", async ({ page }) => {
    // Given the composer contains the first list item
    const textarea = page.getByRole("textbox", { name: "Text message" })
    await textarea.fill("first")
    await textarea.press("End")

    // When the operator activates the Bullet list control
    await page.getByRole("button", { name: "Bullet list" }).click()

    // Then the source contains the WhatsApp bullet marker
    await expect(textarea).toHaveValue("first- ")
    await page.screenshot({ path: "/tmp/qa-fix3-composer-bullet.png", fullPage: true })
    await writeFile(
      "/tmp/qa-fix3-composer-bullet.txt",
      JSON.stringify({ value: await textarea.inputValue(), marker: "- " }, null, 2),
    )
  })

  test("inserts a numbered list marker at the caret", async ({ page }) => {
    // Given the composer contains the first numbered item
    const textarea = page.getByRole("textbox", { name: "Text message" })
    await textarea.fill("first")
    await textarea.press("End")

    // When the operator activates the Numbered list control
    await page.getByRole("button", { name: "Numbered list" }).click()

    // Then the source contains the WhatsApp numbered marker
    await expect(textarea).toHaveValue("first1. ")
    await page.screenshot({ path: "/tmp/qa-fix3-composer-numbered.png", fullPage: true })
    await writeFile(
      "/tmp/qa-fix3-composer-numbered.txt",
      JSON.stringify({ value: await textarea.inputValue(), marker: "1. " }, null, 2),
    )
  })

  test("keeps malformed preview input literal", async ({ page }) => {
    // Given the composer receives an unclosed marker and HTML-like text
    const textarea = page.getByRole("textbox", { name: "Text message" })
    const malformed = "*unclosed <script>alert(1)</script>"

    // When the operator types the malformed preview input
    await textarea.fill(malformed)

    // Then the preview shows text and never creates an executable element
    await expect(page.getByLabel("Message preview")).toContainText(malformed)
    await expect(page.locator(".message-preview-content script")).toHaveCount(0)
    await page.screenshot({ path: "/tmp/qa-fix3-composer-malformed.png", fullPage: true })
    await writeFile(
      "/tmp/qa-fix3-composer-malformed.txt",
      JSON.stringify(
        {
          value: await textarea.inputValue(),
          scriptCount: await page.locator(".message-preview-content script").count(),
        },
        null,
        2,
      ),
    )
  })

  test("handles an empty toolbar selection without losing focus", async ({ page }) => {
    // Given the composer has no selected text
    const textarea = page.getByRole("textbox", { name: "Text message" })
    await textarea.fill("")

    // When the operator activates Bold
    await page.getByRole("button", { name: "Bold" }).click()

    // Then the empty-selection marker is inserted and focus returns to the textarea
    await expect(textarea).toHaveValue("**")
    await expect(textarea).toBeFocused()
    await page.screenshot({ path: "/tmp/qa-fix3-composer-toolbar-empty.png", fullPage: true })
    await writeFile(
      "/tmp/qa-fix3-composer-toolbar-empty.txt",
      JSON.stringify(
        {
          value: await textarea.inputValue(),
          focused: await textarea.evaluate((element) => document.activeElement === element),
        },
        null,
        2,
      ),
    )
  })
})
