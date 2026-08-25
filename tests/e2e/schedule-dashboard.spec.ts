import { z } from "zod"

import { expect, test } from "./dashboard-fixture"

const createdScheduleSchema = z.object({
  jobId: z.string().uuid(),
  state: z.literal("scheduled"),
})

test("shows recovery evidence and locks terminal schedules in the authenticated dashboard", async ({
  page,
}) => {
  // Given the authenticated dashboard has persisted submitted and recovered jobs
  await page.goto("/")
  await page.getByRole("button", { name: "Schedule" }).click()

  const scheduleSelect = page.getByRole("combobox", { name: "Schedule", exact: true })
  await expect(scheduleSelect).toBeVisible()

  // When the operator opens the submitted job
  const submittedOption = scheduleSelect.locator("option").filter({ hasText: "submitted" })
  const submittedId = await submittedOption.getAttribute("value")
  if (submittedId === null) throw new Error("Seeded terminal schedule was not listed")
  await scheduleSelect.selectOption(submittedId)

  // Then terminal state is visible and mutation controls are absent
  const detail = page.locator(".schedule-detail")
  await expect(detail).toContainText("State · submitted")
  await expect(detail.getByRole("button", { name: "Save schedule" })).toHaveCount(0)
  await expect(detail.getByRole("button", { name: "Cancel schedule" })).toHaveCount(0)
  await expect(detail).toContainText("Schedule is locked")

  // When the operator opens the recovered job
  const recoveryOption = scheduleSelect.locator("option").filter({ hasText: "unknown" })
  const recoveryId = await recoveryOption.getAttribute("value")
  if (recoveryId === null) throw new Error("Seeded recovery schedule was not listed")
  await scheduleSelect.selectOption(recoveryId)

  // Then recovery classification is visible without editable sensitive data
  await expect(detail).toContainText("State · unknown")
  await expect(detail).toContainText("Recovery state")
  await expect(detail).toContainText("lease_expired")
  await expect(detail.getByLabel("Scheduled for")).toHaveCount(0)
  await expect(detail.getByLabel("Timezone")).toHaveCount(0)
  await expect(detail.getByRole("button", { name: "Save schedule" })).toHaveCount(0)
  await expect(detail.getByRole("button", { name: "Cancel schedule" })).toHaveCount(0)
})

test("keeps schedule edits validated, CSRF-protected, persistent, and scope-bound", async ({
  page,
  seed,
}) => {
  // Given the authenticated dashboard creates a mutable Personal schedule
  await page.goto("/")
  await page.getByRole("button", { name: "Schedule" }).click()
  await page.getByLabel("Recipient phone number").fill(seed.recipientPhone)
  await page.getByLabel("Text message").fill("Opaque schedule acceptance text")
  await page.getByLabel("I have a valid consent basis for this individual recipient.").check()
  const requestedTime = "2099-12-29T00:00"
  const persistedTime = new Date(requestedTime).toISOString()
  await page.getByLabel("One-time dispatch time").fill(requestedTime)
  const create = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/messages/schedule"),
  )
  await page.getByRole("button", { name: "Create one-time schedule" }).click()
  const created = createdScheduleSchema.parse(await (await create).json())
  await page.reload()
  await page.getByRole("button", { name: "Schedule" }).click()

  // When the operator selects the schedule created by this browser context
  const scheduleSelect = page.getByRole("combobox", { name: "Schedule", exact: true })
  await scheduleSelect.selectOption(created.jobId)
  const detail = page.locator(".schedule-detail")
  await expect(detail.getByLabel("Scheduled for")).toHaveValue(persistedTime)
  const initialTime = await detail.getByLabel("Scheduled for").inputValue()

  // When malformed edit input reaches the authenticated API seam
  await detail.getByLabel("Scheduled for").fill("not-a-date")
  await detail.getByLabel("Timezone").fill("")
  const malformedEdit = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.endsWith(`/schedules/${created.jobId}`),
  )
  await detail.getByRole("button", { name: "Save schedule" }).click()

  // Then validation fails safely and the persisted schedule remains unchanged
  expect((await malformedEdit).status()).toBe(400)
  await expect(page.getByText("Schedule edit unavailable", { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: "Schedule" }).click()
  await scheduleSelect.selectOption(created.jobId)
  await expect(page.locator(".schedule-detail").getByLabel("Scheduled for")).toHaveValue(
    initialTime,
  )

  // When a valid edit is persisted and the dashboard is reloaded
  const editedTime = "2099-12-28T00:00:00.000Z"
  await page.locator(".schedule-detail").getByLabel("Scheduled for").fill(editedTime)
  const edit = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.endsWith(`/schedules/${created.jobId}`),
  )
  await page.locator(".schedule-detail").getByRole("button", { name: "Save schedule" }).click()

  // Then the edit is observable at the API seam and survives reload
  expect((await edit).status()).toBe(200)
  await page.reload()
  await page.getByRole("button", { name: "Schedule" }).click()
  await scheduleSelect.selectOption(created.jobId)
  await expect(page.locator(".schedule-detail").getByLabel("Scheduled for")).toHaveValue(editedTime)

  // When the browser loses its CSRF proof before another mutation
  await page.context().clearCookies({ name: "waha_csrf" })
  const csrfDeniedEdit = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.endsWith(`/schedules/${created.jobId}`),
  )
  await page
    .locator(".schedule-detail")
    .getByLabel("Scheduled for")
    .fill("2099-12-27T00:00:00.000Z")
  await page.locator(".schedule-detail").getByRole("button", { name: "Save schedule" }).click()

  // Then the mutation is denied and the last persisted value remains visible
  expect((await csrfDeniedEdit).status()).toBe(403)
  await expect(
    page.getByText("The server denied this scoped request.", { exact: true }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: "Schedule" }).click()
  await scheduleSelect.selectOption(created.jobId)
  await expect(page.locator(".schedule-detail").getByLabel("Scheduled for")).toHaveValue(editedTime)

  // When the operator changes to the other account scope
  await page.getByLabel("Account scope").selectOption("business")

  // Then the Personal schedule is not visible across the scope boundary
  await expect(page.getByText("No schedules", { exact: true })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Schedule", exact: true })).toHaveCount(0)
})
