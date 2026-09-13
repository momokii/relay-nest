import { describe, expect, it } from "vitest"

import {
  createWahaSessionOperations,
  type WahaRequestOptions,
} from "../apps/api/src/waha/session-adapter"

type SeenRequest = { readonly path: string; readonly timeoutMs: number | undefined }

describe("waha session operation timeouts", () => {
  it("gives QR and pairing-code requests budgets beyond the 5s default", async () => {
    // Given a recording request function in place of the HTTP client
    const seen: SeenRequest[] = []
    const request = async <T>(
      path: string,
      schema: {
        safeParse: (
          value: unknown,
        ) => { readonly success: true; readonly data: T } | { readonly success: false }
      },
      config?: WahaRequestOptions | AbortSignal,
    ): Promise<T> => {
      seen.push({
        path,
        timeoutMs: typeof config === "object" ? config.timeoutMs : undefined,
      })
      const canned = path.includes("request-code")
        ? undefined
        : { mimetype: "image/png", data: "AAA" }
      const parsed = schema.safeParse(canned)
      if (!parsed.success) throw new Error(`unexpected schema mismatch for ${path}`)
      return parsed.data
    }
    const operations = createWahaSessionOperations(request)

    // When QR and pairing-code operations run
    await operations.qr("personal", "image")
    await operations.requestPairingCode("personal", "6281234567890")

    // Then both carry a budget above the 5s adapter default
    expect(seen).toEqual([
      { path: "/api/personal/auth/qr?format=image", timeoutMs: 30_000 },
      { path: "/api/personal/auth/request-code", timeoutMs: 30_000 },
    ])
  })
})
