import { z } from "zod"

import { expect, test } from "./dashboard-fixture"

const createdUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
})
const createUserRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(12),
    displayName: z.string(),
    roles: z
      .array(
        z.object({ accountScope: z.literal("personal"), role: z.literal("operator") }).strict(),
      )
      .length(1),
  })
  .strict()

test.use({ trace: "off" })
test.skip(
  process.env.E2E_DATABASE_URL !== undefined,
  "Admin acceptance requires the disposable global E2E database",
)

test("Admin creates, scopes, and disables a temporary Operator", async ({
  browser,
  page,
  seed,
}) => {
  // Given an authenticated Admin and the two seeded account-scope sessions
  const credentials = {
    email: `operator-${crypto.randomUUID()}@example.invalid`,
    password: `operator-${crypto.randomUUID()}-temporary-password`,
    displayName: "Temporary E2E Operator",
  }
  await page.goto("/")
  await page.getByRole("button", { name: "Users" }).click()

  // When the Admin creates an Operator in Personal scope through the Admin form
  const createForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create user" }),
  })
  const createResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/admin/users" && response.request().method() === "POST",
  )
  await createForm.getByLabel("Email").fill(credentials.email)
  await createForm.getByLabel("Display name").fill(credentials.displayName)
  await createForm.getByLabel("Temporary password").fill(credentials.password)
  await createForm.getByRole("button", { name: "Create user" }).click()
  const created = await createResponse
  expect(created.status()).toBe(201)
  expect(created.request().headers()["x-csrf-token"]).toBeTruthy()
  expect((await created.request().allHeaders()).origin).toBe(new URL(page.url()).origin)
  expect(new URL(created.url()).origin).toBe(new URL(page.url()).origin)
  expect(createUserRequestSchema.parse(JSON.parse(created.request().postData() ?? "{}"))).toEqual({
    email: credentials.email,
    password: credentials.password,
    displayName: credentials.displayName,
    roles: [{ accountScope: "personal", role: "operator" }],
  })
  const operator = createdUserSchema.parse(await created.json())
  expect(operator.email).toBe(credentials.email)

  // When the Admin grants exactly the seeded Personal session
  const grantForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Grant session access" }),
  })
  const grantResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/admin/grants" &&
      response.request().method() === "POST",
  )
  await grantForm.getByLabel("User ID").fill(operator.id)
  await grantForm.getByLabel("Session ID").fill(seed.personal.id)
  await grantForm.getByRole("button", { name: "Grant session access" }).click()
  const granted = await grantResponse
  expect(granted.status()).toBe(204)
  expect(granted.request().headers()["x-csrf-token"]).toBeTruthy()
  expect((await granted.request().allHeaders()).origin).toBe(new URL(page.url()).origin)
  expect(new URL(granted.url()).origin).toBe(new URL(page.url()).origin)

  // When the Operator authenticates in a separate browser context
  const operatorContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    storageState: { cookies: [], origins: [] },
  })
  try {
    const login = await operatorContext.request.post("/auth/login", {
      data: { email: credentials.email, password: credentials.password },
    })

    // Then the new credentials establish an authenticated Operator session
    expect(login.status()).toBe(200)
    const me = await operatorContext.request.get("/auth/me")
    expect(me.status()).toBe(200)
    expect(await me.json()).toEqual({
      user: {
        id: operator.id,
        email: credentials.email,
        displayName: credentials.displayName,
        rolesByScope: { personal: ["operator"], business: [] },
      },
    })
    const csrfToken = z
      .string()
      .min(1)
      .parse((await operatorContext.cookies()).find((cookie) => cookie.name === "waha_csrf")?.value)
    const operatorOrigin = new URL(page.url()).origin
    const personalCommand = await operatorContext.request.post(
      `/scoped/sessions/${seed.personal.id}/commands?scope=personal`,
      { headers: { origin: operatorOrigin, "x-csrf-token": csrfToken } },
    )
    expect(personalCommand.status()).toBe(200)
    expect(await personalCommand.json()).toEqual({
      sessionId: seed.personal.id,
      accountScope: "personal",
      accepted: true,
    })

    const businessCommand = await operatorContext.request.post(
      `/scoped/sessions/${seed.business.id}/commands?scope=business`,
      { headers: { origin: operatorOrigin, "x-csrf-token": csrfToken } },
    )
    expect(businessCommand.status()).toBe(403)
    expect(await businessCommand.json()).toEqual({ error: "forbidden" })

    const personalAccess = await operatorContext.request.get(
      `/scoped/sessions/${seed.personal.id}/status-history?scope=personal`,
    )
    expect(personalAccess.status()).toBe(200)
    expect(await personalAccess.json()).toEqual([])

    // Then the Personal grant cannot be reused against the Business session
    const businessAccess = await operatorContext.request.get(
      `/scoped/sessions/${seed.business.id}/status-history?scope=business`,
    )
    expect(businessAccess.status()).toBe(403)
    expect(await businessAccess.json()).toEqual({ error: "forbidden" })

    // When the Admin disables the Operator
    const disableForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Disable user" }),
    })
    const disableResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/admin/users/${operator.id}/disable` &&
        response.request().method() === "POST",
    )
    await disableForm.getByLabel("User ID").fill(operator.id)
    await disableForm.getByRole("button", { name: "Disable user" }).click()
    const disabled = await disableResponse
    expect(disabled.status()).toBe(204)
    expect(disabled.request().headers()["x-csrf-token"]).toBeTruthy()
    expect((await disabled.request().allHeaders()).origin).toBe(new URL(page.url()).origin)
    expect(new URL(disabled.url()).origin).toBe(new URL(page.url()).origin)

    // Then both fresh authentication and the existing Operator session are rejected
    const disabledLogin = await operatorContext.request.post("/auth/login", {
      data: { email: credentials.email, password: credentials.password },
    })
    expect(disabledLogin.status()).toBe(409)
    expect(await disabledLogin.json()).toEqual({ error: "authentication unavailable" })
    const disabledSession = await operatorContext.request.get(
      `/scoped/sessions/${seed.personal.id}/status-history?scope=personal`,
    )
    expect(disabledSession.status()).toBe(401)
    expect(await disabledSession.json()).toEqual({ error: "unauthenticated" })
  } finally {
    await operatorContext.close()
  }
})
