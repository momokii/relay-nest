import { expect, test } from "./dashboard-fixture"

test("captures the authenticated dashboard at required responsive widths", async ({ page }) => {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Operational overview" })).toBeVisible()
    if (width === 1280) {
      await expect(page.locator(".metric-label")).toHaveCount(4)
      const metricLines = await page.locator(".metric-label").evaluateAll((elements) =>
        elements.map((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)))
            .size
        }),
      )
      expect(metricLines).toEqual([1, 1, 1, 1])
      const metricOverflow = await page.locator(".metric").evaluateAll((elements) =>
        elements.map((element) => {
          const label = element.querySelector<HTMLElement>(".metric-label")
          const value = element.querySelector<HTMLElement>("strong")
          return {
            label: label ? label.scrollWidth > label.clientWidth : true,
            value: value ? value.scrollWidth > value.clientWidth : true,
          }
        }),
      )
      expect(metricOverflow).toEqual([
        { label: false, value: false },
        { label: false, value: false },
        { label: false, value: false },
        { label: false, value: false },
      ])
    }
    await page.screenshot({
      path: `.omo/evidence/task-14-dashboard-e2e-${width}.png`,
      fullPage: true,
      animations: "disabled",
    })
  }
})
