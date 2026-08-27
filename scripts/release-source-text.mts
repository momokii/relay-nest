export function containsSemanticMarker(contents: string, marker: string): boolean {
  const withoutComments = contents.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "")
  return withoutComments.includes(marker)
}
