import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { InfoHint } from "./ui"

describe("InfoHint", () => {
  it("renders the canonical 16px info icon and closed tooltip state", () => {
    const markup = renderToStaticMarkup(createElement(InfoHint, { message: "Transport evidence" }))

    expect(markup).toContain('aria-label="More information"')
    expect(markup).toContain('width="16"')
    expect(markup).toContain('height="16"')
    expect(markup).toContain('viewBox="0 0 24 24"')
    expect(markup).not.toContain('role="tooltip"')
  })
})
