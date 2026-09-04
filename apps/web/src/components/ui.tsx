import type * as React from "react"
import { useId, useState } from "react"

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

export function InfoHint({ message }: Readonly<{ message: string }>): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || pinned
  const hintId = useId()
  return (
    <span className="info-hint">
      <button
        type="button"
        className="info-hint-trigger"
        aria-label="More information"
        aria-expanded={open}
        aria-controls={open ? hintId : undefined}
        aria-describedby={open ? hintId : undefined}
        aria-keyshortcuts="Escape"
        onClick={() => setPinned((current) => !current)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false)
          setPinned(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setHovered(false)
            setPinned(false)
          }
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open ? (
        <span role="tooltip" id={hintId} className="info-hint-tooltip">
          {message}
        </span>
      ) : null}
    </span>
  )
}

export function StatusBadge({
  label,
  tone = "info",
  title,
  info,
}: Readonly<{
  label: string
  tone?: StatusTone
  title?: string
  info?: string
}>): React.JSX.Element {
  return (
    <span className={`status-badge status-${tone}`} title={title}>
      {label}
      {info ? <InfoHint message={info} /> : null}
    </span>
  )
}

export function Metric({
  label,
  value,
  detail,
  title,
  info,
}: Readonly<{
  label: string
  value: string
  detail?: string
  title?: string
  info?: string
}>): React.JSX.Element {
  return (
    <div className="metric" title={title}>
      <span className="metric-label">
        {label}
        {info ? <InfoHint message={info} /> : null}
      </span>
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
