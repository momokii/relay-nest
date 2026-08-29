import type * as React from "react"
import { useEffect, useMemo, useState } from "react"

import type { AccountScope } from "../dashboard-model"
import { createDashboardSessionApi, type SessionChat } from "../dashboard-session-api"
import type { ResourceState } from "../dashboard-state"
import { LoadingRows, StateNotice } from "./ui"

export function ChatDirectory({
  scope,
  sessionId,
  disabled = false,
  onSelect,
}: Readonly<{
  scope: AccountScope
  sessionId: string
  disabled?: boolean
  onSelect?: (chat: SessionChat) => void
}>): React.JSX.Element {
  const api = useMemo(() => createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL), [])
  const [chats, setChats] = useState<ResourceState<readonly SessionChat[]>>({ kind: "loading" })
  const [query, setQuery] = useState("")

  useEffect(() => {
    let current = true
    if (!sessionId) {
      setChats({ kind: "ready", data: [] })
      return () => {
        current = false
      }
    }
    setChats({ kind: "loading" })
    void api.chats(scope, sessionId).then((result) => {
      if (current) setChats(result)
    })
    return () => {
      current = false
    }
  }, [api, scope, sessionId])

  const filtered =
    chats.kind === "ready"
      ? chats.data.filter((chat) => {
          const haystack = `${chat.name ?? ""} ${chat.id}`.toLowerCase()
          return haystack.includes(query.trim().toLowerCase())
        })
      : []

  return (
    <section className="chat-directory" aria-label="WhatsApp chat directory">
      <label>
        <span>Choose from directory</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search contacts and groups"
          disabled={disabled || !sessionId}
        />
      </label>
      {chats.kind === "loading" ? <LoadingRows count={2} /> : null}
      {chats.kind === "error" || chats.kind === "unavailable" ? (
        <StateNotice title="Directory unavailable" message={chats.message} tone="warning" />
      ) : null}
      {chats.kind === "ready" && filtered.length === 0 ? (
        <StateNotice
          title={sessionId ? "No matching chats" : "Select a session first"}
          message={
            sessionId
              ? "Try another name or chat address."
              : "Choose an authorized session to load its chats."
          }
          tone="warning"
        />
      ) : null}
      {filtered.length > 0 ? (
        <div className="chat-directory-list">
          {filtered.map((chat) => (
            <button
              className="directory-item"
              type="button"
              key={chat.id}
              onClick={() => onSelect?.(chat)}
              disabled={disabled || chat.isGroup}
            >
              <strong>{chat.name ?? "Unnamed chat"}</strong>
              <span>
                {chat.isGroup ? "Group · unavailable for individual text" : `Contact · ${chat.id}`}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
