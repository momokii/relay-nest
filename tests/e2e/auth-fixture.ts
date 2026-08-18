import type { APIRequestContext } from "@playwright/test"
import { z } from "zod"

export const principalSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    rolesByScope: z.record(
      z.enum(["personal", "business"]),
      z.array(z.enum(["admin", "operator", "viewer"])),
    ),
  }),
})

export const authCredentialsPath = ".tmp/playwright/credentials.json"
export const e2eAuthCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  displayName: z.string().min(1),
})

export type E2EAuthCredentials = Readonly<{
  email: string
  password: string
  displayName: string
}>

export async function bootstrapOrLogin(
  request: APIRequestContext,
  credentials: E2EAuthCredentials,
): Promise<void> {
  const bootstrap = await request.post("/auth/bootstrap", { data: credentials })
  if (bootstrap.status() === 201) {
    principalSchema.parse(await bootstrap.json())
    return
  }
  if (bootstrap.status() !== 409) {
    throw new Error(`E2E authentication bootstrap failed with status ${bootstrap.status()}`)
  }

  const login = await request.post("/auth/login", {
    data: { email: credentials.email, password: credentials.password },
  })
  if (!login.ok()) throw new Error(`E2E authentication login failed with status ${login.status()}`)
  principalSchema.parse(await login.json())
}
