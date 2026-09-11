import { expect, type Locator, type Page, type Route, test } from "@playwright/test"

const sessionId = "00000000-0000-4000-8000-000000000010"
const scope = "personal"

const historyStates = [
  "scheduled",
  "queued",
  "attempting",
  "submitted",
  "acknowledged",
  "failed",
  "unknown",
  "cancelled",
] as const

type HistoryState = (typeof historyStates)[number]

const PAGE_ONE: readonly HistoryState[] = ["scheduled", "queued", "attempting", "failed"]
const PAGE_TWO: readonly HistoryState[] = ["submitted", "acknowledged", "unknown", "cancelled"]

// Schedule mutation responses must carry UUID ids (scheduleSchema enforces
// them), so every mocked job gets a deterministic UUID keyed by page + state.
function historyJobId(state: HistoryState, page: number): string {
  const slot = String(historyStates.indexOf(state) + 1).padStart(12, "0")
  return `${String(page).padStart(2, "0")}000000-0000-4000-8000-${slot}`
}

const jobStateById = new Map<string, HistoryState>()
for (const page of [1, 2])
  for (const state of historyStates) jobStateById.set(historyJobId(state, page), state)

function historyItem(state: HistoryState, page: number) {
  return {
    id: historyJobId(state, page),
    sessionId,
    scope,
    recipientPhone: "+15551234567",
    snippet80: `Preview for ${state} dispatch`,
    scheduledFor: "2026-09-05T10:00:00.000Z",
    timezone: "Asia/Jakarta",
    createdAt: "2026-09-04T08:00:00.000Z",
    updatedAt: "2026-09-04T08:00:00.000Z",
    state,
    attempts: state === "failed" ? 2 : 0,
    nextAttemptAt: null,
    failureCode: state === "failed" ? "waha_unavailable" : null,
    recoveryCode: null,
    providerMessageId: state === "submitted" ? "provider-123456789012345678901234" : null,
    origin: "scheduled",
  }
}

function scheduleView(jobId: string, state: HistoryState) {
  return {
    id: jobId,
    sessionId,
    accountScope: scope,
    scheduledFor: "2026-09-05T10:00:00.000Z",
    timezone: "Asia/Jakarta",
    state,
    attempts: 0,
    nextAttemptAt: null,
    providerMessageId: null,
    recoveryCode: null,
    failureCode: null,
  }
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

async function mockScheduleDashboard(page: Page): Promise<void> {
  await page.route("**/auth/me", (route) =>
    fulfillJson(route, 200, {
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "operator@example.test",
        displayName: "Operator",
        rolesByScope: { personal: ["operator"], business: ["operator"] },
      },
    }),
  )
  await page.route("**/scoped/sessions**", (route) =>
    fulfillJson(route, 200, [
      {
        id: sessionId,
        accountScope: scope,
        name: "Personal WA",
        status: "WORKING",
        serviceHealth: "healthy",
        sendingReadiness: "ready",
      },
    ]),
  )
  await page.route("**/scoped/analytics**", (route) => fulfillJson(route, 200, {}))
  await page.route(/\/scoped\/sessions\/[^/]+\/chats/, (route) => fulfillJson(route, 200, []))
  // Registered first so the more specific detail route below wins for /:jobId.
  await page.route("**/scoped/sent-history**", async (route) => {
    const currentPage = Number(new URL(route.request().url()).searchParams.get("page"))
    const states = currentPage === 1 ? PAGE_ONE : PAGE_TWO
    await fulfillJson(route, 200, {
      items: states.map((state) => historyItem(state, currentPage)),
      page: currentPage,
      pageSize: 20,
      hasMore: currentPage < 2,
    })
  })
  await page.route(/\/scoped\/sent-history\/[^/?]+/, async (route) => {
    const jobId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "")
    const state = jobStateById.get(jobId)
    if (state === undefined) {
      await fulfillJson(route, 404, { error: "not found" })
      return
    }
    await fulfillJson(route, 200, {
      ...historyItem(state, Number(jobId.slice(0, 2))),
      message: `Full message body for ${state} dispatch`,
    })
  })
}

async function openSendHistory(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("button", { name: /^Send/ }).click()
  await expect(page.getByRole("table", { name: "personal schedule history" })).toBeVisible()
}

function historyRow(page: Page, state: HistoryState): Locator {
  return page.getByRole("row").filter({ hasText: `Preview for ${state} dispatch` })
}

test.describe("combined schedule history table", () => {
  test("renders mixed-state rows on the Send page and opens the full detail modal", async ({
    page,
  }) => {
    await mockScheduleDashboard(page)
    await openSendHistory(page)

    // Then every page-one state renders with its badge tone inside one table
    for (const state of PAGE_ONE) {
      const row = historyRow(page, state)
      await expect(row).toBeVisible()
      const tone = state === "failed" ? "error" : "warning"
      const stateBadge = row.locator(".status-badge", { hasText: new RegExp(`^${state}$`) })
      await expect(stateBadge).toHaveText(state)
      await expect(stateBadge).toHaveClass(new RegExp(`status-${tone}`))
    }
    if (process.env.SCHEDULE_HISTORY_QA === "1") {
      await page.screenshot({ path: "/tmp/opencode/qa-schedule-history/table.png", fullPage: true })
    }

    // When the operator opens the failed row
    await historyRow(page, "failed").getByRole("button", { name: "Details" }).click()
    const dialog = page.getByRole("dialog", { name: "Schedule detail" })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute("aria-modal", "true")
    if (process.env.SCHEDULE_HISTORY_QA === "1") {
      await page.screenshot({ path: "/tmp/opencode/qa-schedule-history/modal.png", fullPage: true })
    }

    // Then the modal shows the full record, not the row preview
    await expect(dialog.getByText("State · failed", { exact: true })).toBeVisible()
    await expect(dialog.getByText("+15551234567")).toBeVisible()
    await expect(dialog.getByText("Full message body for failed dispatch")).toBeVisible()
    await expect(dialog.getByText("Asia/Jakarta")).toBeVisible()
    await expect(dialog.getByText("waha_unavailable")).toBeVisible()

    // When the operator closes the modal
    await dialog.getByRole("button", { name: "Close" }).click()

    // Then the table remains on the Send page without any dialog
    await expect(page.getByRole("table", { name: "personal schedule history" })).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("offers cancel only on scheduled and queued rows and round-trips the cancelled state", async ({
    page,
  }) => {
    await mockScheduleDashboard(page)
    let deleteRequests = 0
    page.on("request", (request) => {
      if (
        request.method() === "DELETE" &&
        new URL(request.url()).pathname.includes("/messages/schedules/")
      )
        deleteRequests += 1
    })
    await openSendHistory(page)

    // When the operator opens the scheduled row and cancels it
    const scheduledJobId = historyJobId("scheduled", 1)
    await page.route(
      `**/scoped/sessions/${sessionId}/messages/schedules/${scheduledJobId}/cancel*`,
      (route) => fulfillJson(route, 200, scheduleView(scheduledJobId, "cancelled")),
    )
    await historyRow(page, "scheduled").getByRole("button", { name: "Details" }).click()
    const dialog = page.getByRole("dialog", { name: "Schedule detail" })
    await expect(dialog.getByRole("button", { name: "Save schedule" })).toBeVisible()
    const cancelResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith(`/messages/schedules/${scheduledJobId}/cancel`),
    )
    await dialog.getByRole("button", { name: "Cancel schedule" }).click()
    expect((await cancelResponse).status()).toBe(200)

    // Then the modal and the table row reconcile to the cancelled state
    await expect(dialog.getByText("State · cancelled", { exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Cancel schedule" })).toHaveCount(0)
    await expect(
      historyRow(page, "scheduled").getByRole("cell", { name: "cancelled", exact: true }),
    ).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Delete schedule" })).toBeVisible()
    await dialog.getByRole("button", { name: "Close" }).click()

    // When the operator inspects the queued and attempting rows
    await historyRow(page, "queued").getByRole("button", { name: "Details" }).click()
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Cancel schedule" }),
    ).toBeVisible()
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
    await historyRow(page, "attempting").getByRole("button", { name: "Details" }).click()
    const attemptingDialog = page.getByRole("dialog", { name: "Schedule detail" })

    // Then the in-flight row exposes no mutation or destructive controls
    await expect(attemptingDialog.getByRole("button", { name: "Cancel schedule" })).toHaveCount(0)
    await expect(attemptingDialog.getByRole("button", { name: "Save schedule" })).toHaveCount(0)
    await expect(attemptingDialog.getByRole("button", { name: "Delete schedule" })).toHaveCount(0)
    await expect(attemptingDialog.getByText("Schedule actions locked")).toBeVisible()
    expect(deleteRequests).toBe(0)
  })

  test("offers delete only on terminal rows behind a confirmation gate that removes the row", async ({
    page,
  }) => {
    await mockScheduleDashboard(page)
    let deleteRequests = 0
    page.on("request", (request) => {
      if (
        request.method() === "DELETE" &&
        new URL(request.url()).pathname.includes("/messages/schedules/")
      )
        deleteRequests += 1
    })
    await openSendHistory(page)

    // When the operator opens the failed row and triggers delete
    const failedJobId = historyJobId("failed", 1)
    await page.route(
      `**/scoped/sessions/${sessionId}/messages/schedules/${failedJobId}*`,
      (route) => fulfillJson(route, 200, scheduleView(failedJobId, "failed")),
    )
    await historyRow(page, "failed").getByRole("button", { name: "Details" }).click()
    const dialog = page.getByRole("dialog", { name: "Schedule detail" })
    await expect(dialog.getByRole("button", { name: "Cancel schedule" })).toHaveCount(0)
    await dialog.getByRole("button", { name: "Delete schedule" }).click()
    const confirmDialog = page.getByRole("dialog", {
      name: `Confirm delete schedule ${failedJobId}`,
    })
    await expect(confirmDialog.getByText("cannot be undone")).toBeVisible()

    // Then dismissing keeps the record and sends nothing
    await confirmDialog.getByRole("button", { name: "Cancel" }).click()
    await expect(confirmDialog).toHaveCount(0)
    await expect(historyRow(page, "failed")).toBeVisible()
    expect(deleteRequests).toBe(0)

    // When the operator deletes through the confirmation gate
    await dialog.getByRole("button", { name: "Delete schedule" }).click()
    const confirmGate = page.getByRole("dialog", {
      name: `Confirm delete schedule ${failedJobId}`,
    })
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        new URL(response.url()).pathname.endsWith(`/messages/schedules/${failedJobId}`),
    )
    await confirmGate.getByRole("button", { name: "Delete" }).click()
    expect((await deleteResponse).status()).toBe(200)

    // Then the row disappears and the modal reports the removal
    await expect(historyRow(page, "failed")).toHaveCount(0)
    await expect(dialog.getByText("Schedule deleted")).toBeVisible()
    await dialog.getByRole("button", { name: "Close" }).click()

    // When the operator inspects the still-scheduled row
    await historyRow(page, "scheduled").getByRole("button", { name: "Details" }).click()

    // Then a mutable row offers no delete action
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Delete schedule" }),
    ).toHaveCount(0)
    expect(deleteRequests).toBe(1)
  })

  test("keeps pagination working across the combined schedule history", async ({ page }) => {
    await mockScheduleDashboard(page)
    await openSendHistory(page)
    const pagination = page.getByRole("navigation", { name: "Schedule history pagination" })

    // Then the first page reports more availability with Previous disabled
    await expect(pagination.getByText("Page 1 · 20 per page · more available")).toBeVisible()
    await expect(pagination.getByRole("button", { name: "Previous" })).toBeDisabled()

    // When the operator advances to the second page
    await pagination.getByRole("button", { name: "Next" }).click()

    // Then the remaining canonical states render with their tones
    for (const state of PAGE_TWO) {
      const row = historyRow(page, state)
      await expect(row).toBeVisible()
      const tone = state === "acknowledged" ? "success" : "info"
      const stateBadge = row.locator(".status-badge", { hasText: new RegExp(`^${state}$`) })
      await expect(stateBadge).toHaveText(state)
      await expect(stateBadge).toHaveClass(new RegExp(`status-${tone}`))
    }
    await expect(pagination.getByText("Page 2 · 20 per page", { exact: true })).toBeVisible()
    await expect(pagination.getByRole("button", { name: "Next" })).toBeDisabled()

    // When the operator returns to the first page
    await pagination.getByRole("button", { name: "Previous" }).click()

    // Then the first page renders again
    await expect(historyRow(page, "scheduled")).toBeVisible()
    await expect(pagination.getByText("Page 1 · 20 per page · more available")).toBeVisible()
  })
})
