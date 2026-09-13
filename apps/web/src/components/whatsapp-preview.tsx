import * as React from "react"

const INLINE_PATTERN = /(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g

function renderInlineSegment(segment: string, keyPrefix: string): React.ReactNode[] {
  return segment.split(INLINE_PATTERN).map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.length >= 6 && part.startsWith("```") && part.endsWith("```"))
      return <code key={key}>{part.slice(3, -3)}</code>
    if (part.length >= 2 && part.startsWith("*") && part.endsWith("*"))
      return <strong key={key}>{part.slice(1, -1)}</strong>
    if (part.length >= 2 && part.startsWith("_") && part.endsWith("_"))
      return <em key={key}>{part.slice(1, -1)}</em>
    if (part.length >= 2 && part.startsWith("~") && part.endsWith("~"))
      return <s key={key}>{part.slice(1, -1)}</s>
    return <React.Fragment key={key}>{part}</React.Fragment>
  })
}

export function WhatsAppPreview({ message }: Readonly<{ message: string }>): React.JSX.Element {
  const lines = message.split("\n")
  return (
    <span className="whatsapp-preview">
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: split lines are static and never reorder
        <React.Fragment key={`line-${index}`}>
          {index > 0 ? <br /> : null}
          {renderInlineSegment(line, `line-${index}`)}
        </React.Fragment>
      ))}
    </span>
  )
}
