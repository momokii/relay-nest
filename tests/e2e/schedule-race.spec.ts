import { expect, test } from "./dashboard-fixture"

type Deferred = Readonly<{
  promise: Promise<void>
  release: () => void
}>

function deferred(): Deferred {
  let release = (): void => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function historyJob(id: string, sessionId: string, scheduledFor: string) {
  return {
    id,
    sessionId,
    scope: "personal" as const,
    recipientPhone: "+15551234567",
    recipientName: null,
    snippet80: `Preview for ${id.slice(0, 2)} dispatch`,
    scheduledFor,
    timezone: "UTC",
    createdAt: "2026-09-04T08:00:00.000Z",
    updatedAt: "2026-09-04T08:00:00.000Z",
    state: "scheduled" as const,
    attempts: 0,
    nextAttemptAt: null,
    failureCode: null,
    recoveryCode: null,
    providerMessageId: null,
    origin: "scheduled" as const,
  }
}

test("ignores an older detail response after rapid schedule selection", async ({ page, seed }) => {
  const first = historyJob(
    "11111111-1111-4111-8111-111111111111",
    seed.personal.id,
    "2099-02-01T12:00:00.000Z",
  )
  const second = historyJob(
    "22222222-2222-4222-8222-222222222222",
    seed.personal.id,
    "2099-02-02T12:00:00.000Z",
  )
  const details = new Map([
    [first.id, first],
    [second.id, second],
  ])
  const pending = new Map<string, Deferred>()
  const listRoute = "**/scoped/sent-history?*"
  const detailRoute = /\/scoped\/sent-history\/[^/?]+/

  await page.route(listRoute, async (route) =>
    route.fulfill({
      json: {
        items: [first, second],
        page: 1,
        pageSize: 20,
        hasMore: false,
        total: 2,
      },
      contentType: "application/json",
    }),
  )
  await page.route(detailRoute, async (route) => {
    const jobId = new URL(route.request().url()).pathname.split("/").at(-1)
    if (!jobId) throw new Error("Schedule detail route did not include a job ID")
    const detail = details.get(jobId)
    if (!detail) throw new Error(`Unexpected schedule detail request: ${jobId}`)
    const request = deferred()
    pending.set(jobId, request)
    await request.promise
    await route.fulfill({ json: { ...detail, message: `Full message for ${jobId}` } })
  })

  try {
    // Given the schedule history returns two persisted jobs and preloads the first detail
    await page.goto("/")
    const firstDetail = page.waitForRequest((request) =>
      request.url().endsWith(`/scoped/sent-history/${first.id}?scope=personal`),
    )
    await page.getByRole("button", { name: "Schedule" }).click()
    await expect(page.getByRole("table", { name: "personal schedule history" })).toBeVisible()
    await firstDetail

    // When the operator opens the second job before the first response completes
    const secondDetail = page.waitForRequest((request) =>
      request.url().endsWith(`/scoped/sent-history/${second.id}?scope=personal`),
    )
    await page.getByRole("button", { name: `View details for job ${second.id}` }).click()
    await secondDetail
    pending.get(second.id)?.release()
    const detail = page.getByRole("dialog", { name: "Schedule detail" })
    await expect(detail.getByText("02/02/2099, 12:00 · UTC")).toBeVisible()

    // When the older response finally completes
    const firstResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/scoped/sent-history/${first.id}?scope=personal`),
    )
    pending.get(first.id)?.release()
    await firstResponse

    // Then stale data cannot replace the currently selected job
    await expect(detail.getByText("02/02/2099, 12:00 · UTC")).toBeVisible()
  } finally {
    for (const request of pending.values()) request.release()
    await page.unroute(listRoute)
    await page.unroute(detailRoute)
  }
})
