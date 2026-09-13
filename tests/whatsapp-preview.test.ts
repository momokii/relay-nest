import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { WhatsAppPreview } from "../apps/web/src/components/whatsapp-preview"

describe("whatsapp message preview", () => {
  it("renders WhatsApp formatting and preserves line breaks", () => {
    // Given a message with WhatsApp markup across two lines
    const markup = renderToStaticMarkup(
      createElement(WhatsAppPreview, { message: "~asdasd~\n*test lalla* _ini juga_" }),
    )

    // When rendered
    // Then formatting becomes elements and the break becomes a br
    expect(markup).toContain("<s>asdasd</s>")
    expect(markup).toContain("<br/>")
    expect(markup).toContain("<strong>test lalla</strong>")
    expect(markup).toContain("<em>ini juga</em>")
  })

  it("escapes markup instead of interpreting it", () => {
    // Given a message containing HTML metacharacters
    const markup = renderToStaticMarkup(
      createElement(WhatsAppPreview, { message: "<script>alert(1)</script>" }),
    )

    // When rendered
    // Then the content is escaped and no element is created
    expect(markup).toContain("&lt;script&gt;")
    expect(markup).not.toContain("<script>")
  })

  it("leaves plain text untouched", () => {
    // Given a message without any WhatsApp markup
    const markup = renderToStaticMarkup(createElement(WhatsAppPreview, { message: "hello world" }))

    // When rendered
    // Then the text passes through inside the preview wrapper
    expect(markup).toContain('class="whatsapp-preview"')
    expect(markup).toContain("hello world")
  })
})
