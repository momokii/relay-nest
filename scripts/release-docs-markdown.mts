type Fence = {
  readonly character: "`" | "~"
  readonly length: number
}

function fenceMarker(line: string): { readonly marker: string; readonly trailing: string } | null {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
  if (match?.[1] === undefined || match[2] === undefined) return null
  return { marker: match[1], trailing: match[2] }
}

function isClosingFence(
  fence: Fence,
  candidate: { readonly marker: string; readonly trailing: string },
): boolean {
  return (
    candidate.marker[0] === fence.character &&
    candidate.marker.length >= fence.length &&
    /^\s*$/.test(candidate.trailing)
  )
}

export function withoutCodeBlocks(contents: string): string {
  let fence: Fence | null = null
  return contents
    .split("\n")
    .map((line) => {
      const candidate = fenceMarker(line)
      if (candidate !== null) {
        const character = candidate.marker[0]
        if (character !== "`" && character !== "~") return line
        if (fence === null) fence = { character, length: candidate.marker.length }
        else if (isClosingFence(fence, candidate)) fence = null
        return line.replace(/[^\r\n]/g, " ")
      }
      return fence === null ? line : line.replace(/[^\r\n]/g, " ")
    })
    .join("\n")
}
