import { describe, expect, it } from "vitest"

import { qrImageSource } from "../apps/web/src/components/session-connect-panel"

describe("session QR rendering", () => {
  it("renders a provider data-URL QR as an image", () => {
    // Given WAHA returned the QR as a PNG data URL
    const value = "data:image/png;base64,qr-image-bytes"

    // When the connect panel resolves the image source
    const source = qrImageSource(value)

    // Then the data URL is used directly as the image source
    expect(source).toBe("data:image/png;base64,qr-image-bytes")
  })

  it("keeps a raw text QR payload out of the image element", () => {
    // Given the provider returned the QR payload as plain text
    const value = "2@AbCdEfGhIjKlMnOpQrStUvWxYz=="

    // When the connect panel resolves the image source
    const source = qrImageSource(value)

    // Then no image source is produced and the text fallback renders instead
    expect(source).toBeNull()
  })
})
