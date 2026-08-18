import type * as React from "react"
import { useId } from "react"

export type PanelTone = "standard" | "warning" | "error" | "inset"

const SKELETON_IDS = ["one", "two", "three", "four", "five", "six"] as const

type PanelProps = Readonly<{
  eyebrow?: string
  title: string
  description?: string
  tone?: PanelTone
  children: React.ReactNode
  action?: React.ReactNode
}>

export function Panel({
  eyebrow,
  title,
  description,
  tone = "standard",
  children,
  action,
}: PanelProps): React.JSX.Element {
  const panelId = useId()
  const titleId = `${panelId}-title`
  const descriptionId = `${panelId}-description`
  return (
    <section
      className={`panel panel-${tone}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div className="panel-heading">
        <div>
          {eyebrow ? <p className="overline">{eyebrow}</p> : null}
          <h2 id={titleId}>{title}</h2>
          {description ? (
            <p className="panel-description" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

type StateNoticeProps = Readonly<{
  title: string
  message: string
  tone?: PanelTone
  action?: React.ReactNode
  live?: "polite" | "assertive"
}>

export function StateNotice({
  title,
  message,
  tone = "inset",
  action,
  live,
}: StateNoticeProps): React.JSX.Element {
  return (
    <div
      className={`state-notice state-${tone}`}
      aria-live={live}
      aria-atomic={live ? "true" : undefined}
    >
      <strong>{title}</strong>
      <span>{message}</span>
      {action ? <div className="state-action">{action}</div> : null}
    </div>
  )
}

type StatusTone = "success" | "warning" | "error" | "info"

export function StatusBadge({
  label,
  tone = "info",
}: Readonly<{ label: string; tone?: StatusTone }>): React.JSX.Element {
  return <span className={`status-badge status-${tone}`}>{label}</span>
}

export function Metric({
  label,
  value,
  detail,
}: Readonly<{ label: string; value: string; detail?: string }>): React.JSX.Element {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </div>
  )
}

export function LoadingRows({ count = 3 }: Readonly<{ count?: number }>): React.JSX.Element {
  return (
    <output className="loading-rows" aria-label="Loading">
      {SKELETON_IDS.slice(0, count).map((id) => (
        <span className="loading-row" key={id} />
      ))}
    </output>
  )
}

export function Divider(): React.JSX.Element {
  return <div className="divider" aria-hidden="true" />
}
