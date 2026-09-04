import { describe, expect, it } from "vitest"

import { parseWhatsAppMarkup, renderPreview } from "./whatsapp-format"

describe("parseWhatsAppMarkup", () => {
  it("renders bold text", () => {
    expect(parseWhatsAppMarkup("*b*")).toBe("<strong>b</strong>")
  })

  it("renders italic text", () => {
    expect(parseWhatsAppMarkup("_i_")).toBe("<em>i</em>")
  })

  it("renders strikethrough text", () => {
    expect(parseWhatsAppMarkup("~s~")).toBe("<s>s</s>")
  })

  it("renders monospace text", () => {
    expect(parseWhatsAppMarkup("```m```")).toBe("<code>m</code>")
  })

  it("renders consecutive bullet lines as one list", () => {
    expect(parseWhatsAppMarkup("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>")
  })

  it("renders WhatsApp asterisk bullet lines as one list", () => {
    expect(parseWhatsAppMarkup("* a\n* b")).toBe("<ul><li>a</li><li>b</li></ul>")
  })

  it("renders consecutive numbered lines as one list", () => {
    expect(parseWhatsAppMarkup("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>")
  })

  it("escapes text before returning markup", () => {
    expect(parseWhatsAppMarkup("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    )
  })

  it("keeps unmatched delimiters literal", () => {
    expect(parseWhatsAppMarkup("*unclosed")).toBe("*unclosed")
  })

  it("treats escaped delimiters as literal text", () => {
    expect(parseWhatsAppMarkup(String.raw`\*not bold\* \_not italic\_`)).toBe(
      "*not bold* _not italic_",
    )
  })

  it("does not emit executable markup from hostile or malformed input", () => {
    const preview = parseWhatsAppMarkup(`<img src=x onerror="alert(1)"> *ok <b>bad</b>`)
    expect(preview).toBe('&lt;img src=x onerror="alert(1)"&gt; *ok &lt;b&gt;bad&lt;/b&gt;')
    expect(preview).not.toMatch(/<(?!strong|em|s|code|ul|ol|li)(?:[^>]+)>/)
  })

  it("keeps mixed list kinds separate", () => {
    expect(parseWhatsAppMarkup("- a\n1. b")).toBe("<ul><li>a</li></ul>\n<ol><li>b</li></ol>")
  })
})

describe("renderPreview", () => {
  it("returns the same safe preview markup as the parser", () => {
    expect(renderPreview("*approved* message")).toBe("<strong>approved</strong> message")
  })

  it("keeps the raw WhatsApp syntax represented by the preview", () => {
    expect(renderPreview("*bold* _italic_ ~strike~ ```mono```\n- item\n1. item")).toBe(
      "<strong>bold</strong> <em>italic</em> <s>strike</s> <code>mono</code>\n<ul><li>item</li></ul>\n<ol><li>item</li></ol>",
    )
  })
})
