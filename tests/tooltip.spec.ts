import { writeFile } from "node:fs/promises"

import { expect, test } from "./e2e/dashboard-fixture"

test.describe("analytics tooltip", () => {
  test("reveals on focus with aria-describedby and closes with Escape", async ({ page }) => {
    // Given an authenticated dashboard with an analytics info control
    await page.goto("/")
    const trigger = page.getByRole("button", { name: "More information" }).first()

    // When the control receives keyboard focus
    await trigger.focus()

    // Then the tooltip is exposed through aria-describedby
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    const describedBy = await trigger.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    const tooltip = page.getByRole("tooltip")
    await expect(tooltip).toHaveAttribute("id", describedBy ?? "")
    await page.screenshot({ path: "/tmp/qa-t2.png" })
    await writeFile(
      "/tmp/qa-t2.txt",
      JSON.stringify(
        await trigger.evaluate((element) => ({
          ariaLabel: element.getAttribute("aria-label"),
          ariaExpanded: element.getAttribute("aria-expanded"),
          ariaControls: element.getAttribute("aria-controls"),
          ariaDescribedBy: element.getAttribute("aria-describedby"),
          tooltipRole: element.parentElement
            ?.querySelector('[role="tooltip"]')
            ?.getAttribute("role"),
        })),
        null,
        2,
      ),
    )

    // When Escape is pressed
    await page.keyboard.press("Escape")

    // Then the tooltip closes and the relationship is removed
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(trigger).not.toHaveAttribute("aria-describedby")
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await page.screenshot({ path: "/tmp/qa-fix3-tooltip-escape.png", fullPage: true })
    await writeFile(
      "/tmp/qa-fix3-tooltip-escape.txt",
      JSON.stringify(
        {
          ariaExpanded: await trigger.getAttribute("aria-expanded"),
          ariaDescribedBy: await trigger.getAttribute("aria-describedby"),
          tooltipCount: await page.getByRole("tooltip").count(),
        },
        null,
        2,
      ),
    )
  })

  test("reveals on hover and closes on blur", async ({ page }) => {
    // Given an authenticated dashboard with an analytics info control
    await page.goto("/")
    const trigger = page.getByRole("button", { name: "More information" }).first()

    // When the pointer hovers the control
    await trigger.hover()

    // Then the tooltip is visible
    await expect(page.getByRole("tooltip")).toBeVisible()

    // When focus moves away from the control
    await page.locator("body").click({ position: { x: 4, y: 4 } })

    // Then the tooltip closes
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await page.screenshot({ path: "/tmp/qa-fix3-tooltip-blur.png", fullPage: true })
    await writeFile(
      "/tmp/qa-fix3-tooltip-blur.txt",
      JSON.stringify(
        {
          ariaExpanded: await trigger.getAttribute("aria-expanded"),
          ariaDescribedBy: await trigger.getAttribute("aria-describedby"),
          tooltipCount: await page.getByRole("tooltip").count(),
        },
        null,
        2,
      ),
    )
  })
})
