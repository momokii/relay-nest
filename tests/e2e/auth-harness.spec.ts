import { expect, test } from "@playwright/test"

test("uses real auth cookies for relative API requests and preserves CSRF enforcement", async ({
  page,
}) => {
  // Given the production preview has a real authenticated storage state
  const authMe = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/me")

  // When the browser opens the dashboard boundary
  await page.goto("/")

  // Then the relative auth request reaches the disposable API with its session cookie
  expect((await authMe).status()).toBe(200)

  // When a same-origin mutation omits the double-submit CSRF proof
  const csrfDenied = await page.evaluate(async () => {
    const response = await fetch("/auth/logout", { credentials: "include", method: "POST" })
    return response.status
  })

  // Then the API rejects the mutation instead of weakening its security boundary
  expect(csrfDenied).toBe(403)
})
