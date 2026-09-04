import type * as React from "react"
import { useEffect, useMemo, useState } from "react"

import type { AccountScope } from "../dashboard-model"
import {
  createDashboardSessionApi,
  type SentHistoryItem,
  type SentHistoryState,
} from "../dashboard-session-api"
import { Panel, StateNotice } from "./ui"

const PAGE_SIZE = 10

function stateClass(state: SentHistoryState): string {
  switch (state) {
    case "acknowledged":
      return "status-badge status-success"
    case "failed":
      return "status-badge status-error"
    case "scheduled":
    case "queued":
    case "attempting":
      return "status-badge status-warning"
    case "submitted":
    case "unknown":
    case "cancelled":
      return "status-badge"
    default:
      return assertNever(state)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected sent history state: ${String(value)}`)
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function truncatedProviderId(value: string | null): string {
  if (!value) return "—"
  return value.length > 24 ? `${value.slice(0, 21)}…` : value
}

export function SentHistoryPanel({ scope }: Readonly<{ scope: AccountScope }>): React.JSX.Element {
  const api = useMemo(() => createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL), [])
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly data: SentHistoryItem[]; readonly hasMore: boolean }
    | { readonly kind: "unavailable" | "denied" | "error"; readonly message: string }
  >({ kind: "loading" })

  useEffect(() => {
    let current = true
    setResult({ kind: "loading" })
    void api.sentHistory(scope, page, PAGE_SIZE).then((response) => {
      if (!current) return
      if (response.kind === "ready") {
        setResult({ kind: "ready", data: response.data.items, hasMore: response.data.hasMore })
        return
      }
      setResult(response)
    })
    return () => {
      current = false
    }
  }, [api, page, scope])

  return (
    <Panel
      eyebrow={`${scope} scope`}
      title="Sent history"
      description="Recent text dispatches from this account scope. Message content is shown only as a short preview."
    >
      {result.kind === "loading" ? (
        <p className="panel-description">Loading sent history…</p>
      ) : null}
      {result.kind === "unavailable" || result.kind === "denied" || result.kind === "error" ? (
        <StateNotice title="History unavailable" message={result.message} tone="warning" />
      ) : null}
      {result.kind === "ready" && result.data.length === 0 ? (
        <StateNotice
          title="No sent messages"
          message="Text dispatches in this scope will appear here."
        />
      ) : null}
      {result.kind === "ready" && result.data.length > 0 ? (
        <>
          <div className="sent-history-table-wrap">
            <table className="sent-history-table" aria-label={`${scope} sent message history`}>
              <caption className="visually-hidden">Sent message history</caption>
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Message</th>
                  <th scope="col">When</th>
                  <th scope="col">State</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Provider ID</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.recipientPhone ?? "Unavailable"}</td>
                    <td>{item.snippet80 ?? "Unavailable"}</td>
                    <td>{formatDate(item.scheduledFor || item.createdAt)}</td>
                    <td>
                      <span className={stateClass(item.state)}>{item.state}</span>
                    </td>
                    <td>{item.attempts}</td>
                    <td>
                      <code title={item.providerMessageId ?? undefined}>
                        {truncatedProviderId(item.providerMessageId)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="sent-history-pagination" aria-label="Sent history pagination">
            <span>
              Page {page}
              {result.hasMore ? " · more available" : ""}
            </span>
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={!result.hasMore}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      ) : null}
    </Panel>
  )
}
