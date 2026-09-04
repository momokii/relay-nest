const MARKERS = ["```", "*", "_", "~", "`"] as const
type Marker = (typeof MARKERS)[number]

const TAGS = {
  "```": ["<code>", "</code>"],
  "*": ["<strong>", "</strong>"],
  _: ["<em>", "</em>"],
  "~": ["<s>", "</s>"],
  "`": ["<code>", "</code>"],
} as const satisfies Readonly<Record<Marker, readonly [string, string]>>

function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function isEscapableCharacter(character: string | undefined): boolean {
  return (
    character === "\\" ||
    character === "*" ||
    character === "_" ||
    character === "~" ||
    character === "`"
  )
}

function closingMarkerIndex(text: string, marker: Marker, start: number): number {
  let index = start
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2
      continue
    }
    if (text.startsWith(marker, index)) return index
    index += 1
  }
  return -1
}

function parseInline(text: string): string {
  let output = ""
  let index = 0

  while (index < text.length) {
    const character = text[index]
    if (character === "\\" && isEscapableCharacter(text[index + 1])) {
      output += escapeText(text[index + 1] ?? "")
      index += 2
      continue
    }

    const marker = MARKERS.find((candidate) => text.startsWith(candidate, index))
    if (!marker) {
      output += escapeText(character ?? "")
      index += 1
      continue
    }

    const closingIndex = closingMarkerIndex(text, marker, index + marker.length)
    if (closingIndex <= index + marker.length) {
      output += escapeText(marker)
      index += marker.length
      continue
    }

    const [openingTag, closingTag] = TAGS[marker]
    output += `${openingTag}${parseInline(text.slice(index + marker.length, closingIndex))}${closingTag}`
    index = closingIndex + marker.length
  }

  return output
}

type ListKind = "ul" | "ol"
type ListLine = Readonly<{ kind: ListKind; content: string }>

function listLine(line: string): ListLine | undefined {
  const bullet = /^-\s+(.*)$/.exec(line)
  if (bullet) return { kind: "ul", content: bullet[1] ?? "" }

  const asteriskBullet = /^\*\s+(.*)$/.exec(line)
  if (asteriskBullet) return { kind: "ul", content: asteriskBullet[1] ?? "" }

  const numbered = /^\d+\.\s+(.*)$/.exec(line)
  if (numbered) return { kind: "ol", content: numbered[1] ?? "" }
  return undefined
}

function renderList(lines: readonly ListLine[]): string {
  const kind = lines[0]?.kind
  if (!kind) return ""
  const items = lines.map((line) => `<li>${parseInline(line.content)}</li>`).join("")
  return `<${kind}>${items}</${kind}>`
}

export function parseWhatsAppMarkup(text: string): string {
  const lines = text.split("\n")
  const output: string[] = []
  let index = 0

  while (index < lines.length) {
    const currentLine = lines[index] ?? ""
    const firstListLine = listLine(currentLine)
    if (!firstListLine) {
      output.push(parseInline(currentLine))
      index += 1
      if (index < lines.length) output.push("\n")
      continue
    }

    const listLines: ListLine[] = [firstListLine]
    index += 1
    while (index < lines.length) {
      const nextListLine = listLine(lines[index] ?? "")
      if (!nextListLine || nextListLine.kind !== firstListLine.kind) break
      listLines.push(nextListLine)
      index += 1
    }
    output.push(renderList(listLines))
    if (index < lines.length) output.push("\n")
  }

  return output.join("")
}

export function renderPreview(text: string): string {
  return parseWhatsAppMarkup(text)
}
