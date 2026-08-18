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

function schedule(id: string, sessionId: string, scheduledFor: string) {
  return {
    id,
    sessionId,
    accountScope: "personal" as const,
    scheduledFor,
    timezone: "UTC",
    state: "scheduled" as const,
    attempts: 0,
    nextAttemptAt: null,
    providerMessageId: null,
    recoveryCode: null,
    failureCode: null,
  }
}

test("ignores an older detail response after rapid schedule selection", async ({ page, seed }) => {
  const first = schedule(
    "11111111-1111-4111-8111-111111111111",
    seed.personal.id,
    "2099-02-01T12:00:00.000Z",
  )
  const second = schedule(
    "22222222-2222-4222-8222-222222222222",
    seed.personal.id,
    "2099-02-02T12:00:00.000Z",
  )
  const details = new Map([
    [first.id, first],
    [second.id, second],
  ])
  const pending = new Map<string, Deferred>()
  const scheduleRoute = /\/messages\/schedules(?:\/|\?)/

  await page.route(scheduleRoute, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue()
      return
    }
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/messages/schedules")) {
      await route.fulfill({ json: [first, second] })
      return
    }
    const jobId = path.split("/").at(-1)
    if (!jobId) throw new Error("Schedule detail route did not include a job ID")
    const detail = details.get(jobId)
    if (!detail) throw new Error(`Unexpected schedule detail request: ${jobId}`)
    const request = deferred()
    pending.set(jobId, request)
    await request.promise
    await route.fulfill({ json: detail })
  })

  try {
    // Given the schedule list returns two persisted jobs
    await page.goto("/")
    const firstDetail = page.waitForRequest((request) =>
      request.url().endsWith(`/${first.id}?scope=personal`),
    )
    await page.getByRole("button", { name: "Schedule" }).click()
    await firstDetail

    // When the operator selects the second job before the first response completes
    const secondDetail = page.waitForRequest((request) =>
      request.url().endsWith(`/${second.id}?scope=personal`),
    )
    await page.getByRole("combobox", { name: "Schedule", exact: true }).selectOption(second.id)
    await secondDetail
    pending.get(second.id)?.release()

    // Then the newest response controls the visible detail
    const detail = page.locator(".schedule-detail")
    await expect(detail.getByLabel("Scheduled for")).toHaveValue(second.scheduledFor)

    // When the older response finally completes
    const firstResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/${first.id}?scope=personal`),
    )
    pending.get(first.id)?.release()
    await firstResponse

    // Then stale data cannot replace the currently selected job
    await expect(detail.getByLabel("Scheduled for")).toHaveValue(second.scheduledFor)
  } finally {
    for (const request of pending.values()) request.release()
    await page.unroute(scheduleRoute)
  }
})
