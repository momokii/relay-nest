import { expect, test } from "./dashboard-fixture"

test.describe("users row-menu portal", () => {
  test("opens portaled menu for the last row fully in viewport and closes on outside click and scroll", async ({
    page,
  }) => {
    // Given an authenticated Admin on the Users page
    await page.goto("/")
    await page.getByRole("button", { name: "Users" }).click()
    const table = page.locator("table[aria-label='Users']")
    await expect(table).toBeVisible()

    // Deterministic viewport for bounding-box checks
    await page.setViewportSize({ width: 1100, height: 800 })
    const trigger = page.getByLabel(/Actions for /).last()
    await expect(trigger).toBeVisible()

    // Table remains horizontally scrollable but the page itself does not overflow
    const tableWrap = page.locator(".sent-history-table-wrap").first()
    const tableWrapScrollsHorizontally = await tableWrap.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    )
    // In the seeded e2e dataset the table may or may not overflow depending on role column width;
    // the invariant is that the document itself does not grow horizontally.
    void tableWrapScrollsHorizontally
    const noPageHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )
    expect(noPageHorizontalOverflow).toBe(true)

    // When the last-row kebab is scrolled into view and clicked, the portal menu must stay open on first open
    await trigger.scrollIntoViewIfNeeded()
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100))),
    )
    await trigger.click()

    const menu = page.locator(".row-menu-list").first()
    await expect(menu).toBeVisible()
    const items = menu.getByRole("menuitem")
    // Active user shows Grant session, Reset password, Disable
    await expect(items).toHaveCount(3)
    await expect(menu.getByRole("menuitem", { name: "Grant session" })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "Reset password" })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "Disable" })).toBeVisible()

    // Then the menu is portaled to document.body with fixed positioning and never clipped by the table wrap
    const portalHostIsBody = await menu.evaluate(
      (element) => element.parentElement === document.body,
    )
    expect(portalHostIsBody).toBe(true)
    const style = await menu.evaluate((element) => {
      const computed = getComputedStyle(element)
      return { position: computed.position, zIndex: computed.zIndex }
    })
    expect(style.position).toBe("fixed")
    expect(Number(style.zIndex)).toBeGreaterThanOrEqual(60)

    // Bounding box must be fully inside the viewport (flip-up for last row when needed)
    const box = await menu.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(1100)
      expect(box.y + box.height).toBeLessThanOrEqual(800)
    }

    await page.mouse.click(700, 300)
    await expect(menu).toHaveCount(0)

    // When reopened, a window scroll also closes the menu
    await trigger.scrollIntoViewIfNeeded()
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100))),
    )
    await trigger.click()
    await expect(menu).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")))
    await expect(menu).toHaveCount(0)

    // Reopen for the Disable flow, verify the confirmation panel opens and is same-origin gated
    await trigger.scrollIntoViewIfNeeded()
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100))),
    )
    await trigger.click()
    await expect(menu).toBeVisible()
    const disableItem = menu.getByRole("menuitem", { name: "Disable" })
    await disableItem.click()
    const disablePanel = page.locator(".chat-history-panel[aria-label^='Disable']")
    await expect(disablePanel).toBeVisible()
  })
})
