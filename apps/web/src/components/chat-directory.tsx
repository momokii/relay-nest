import type * as React from "react"
import { useEffect, useId, useMemo, useState } from "react"

import type { AccountScope } from "../dashboard-model"
import { createDashboardSessionApi, type SessionChat } from "../dashboard-session-api"
import type { ResourceState } from "../dashboard-state"
import { LoadingRows, StateNotice } from "./ui"

export function directoryContactTarget(
  chat: Pick<SessionChat, "phone" | "isGroup">,
): string | undefined {
  if (chat.isGroup || chat.phone === null) return undefined
  return chat.phone
}

export function directoryChatKey(chat: SessionChat, index: number): string {
  const identity = chat.phone ?? `${chat.name ?? "unnamed"}-${chat.isGroup ? "group" : "chat"}`
  return `${identity}-${index}`
}

function directoryContactDescription(chat: SessionChat): string {
  if (chat.isGroup) return "Group · unavailable for individual text"
  const target = directoryContactTarget(chat)
  return target === undefined
    ? "Contact identity unavailable · enter E.164 manually"
    : `Contact · ${target}`
}

export function ChatDirectory({
  scope,
  sessionId,
  disabled = false,
  selectedChatId,
  onSelect,
}: Readonly<{
  scope: AccountScope
  sessionId: string
  disabled?: boolean
  selectedChatId?: string | undefined
  onSelect?: (chat: SessionChat) => void
}>): React.JSX.Element {
  const api = useMemo(() => createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL), [])
  const [chats, setChats] = useState<ResourceState<readonly SessionChat[]>>({ kind: "loading" })
  const [query, setQuery] = useState("")
  const directoryId = useId()

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
          const haystack = `${chat.name ?? ""} ${chat.phone ?? ""}`.toLowerCase()
          return haystack.includes(query.trim().toLowerCase())
        })
      : []
  const availableCount =
    chats.kind === "ready"
      ? chats.data.filter((chat) => directoryContactTarget(chat) !== undefined).length
      : 0

  return (
    <section className="chat-directory" aria-label="Contact list from WhatsApp chat directory">
      <div className="chat-directory-heading">
        <div>
          <p className="overline">Recipient selector</p>
          <h3 id={`${directoryId}-title`}>Choose a contact</h3>
          <p className="chat-directory-copy">
            Select one individual contact. Selecting a contact only fills the recipient; sending
            still requires your final submit.
          </p>
        </div>
        {chats.kind === "ready" ? (
          <span className="directory-count">
            {availableCount} {availableCount === 1 ? "contact" : "contacts"} available
          </span>
        ) : null}
      </div>
      <label>
        <span>Search contact list</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or phone number"
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
          {filtered.map((chat, index) => (
            <button
              className={`directory-item${selectedChatId === chat.phone ? " is-selected" : ""}`}
              type="button"
              key={directoryChatKey(chat, index)}
              onClick={() => onSelect?.(chat)}
              disabled={disabled || directoryContactTarget(chat) === undefined}
              aria-pressed={selectedChatId === chat.phone}
            >
              <strong>{chat.name ?? "Unnamed chat"}</strong>
              <span>{directoryContactDescription(chat)}</span>
              {selectedChatId === chat.phone ? (
                <span className="directory-selection">Selected</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
