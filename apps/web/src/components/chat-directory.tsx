import type * as React from "react"
import { useEffect, useMemo, useState } from "react"

import type { AccountScope } from "../dashboard-model"
import {
  createDashboardSessionApi,
  type MessageView,
  type SessionChat,
} from "../dashboard-session-api"
import { type ResourceState, resourceFromResult } from "../dashboard-state"
import { ChatHistoryOverlay, historyChatLabel } from "./chat-history-overlay"
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

function directoryActivityLine(chat: SessionChat): string | null {
  const activity = chat.lastActivity
  if (!activity || (activity.preview === null && activity.at === null)) return null
  const prefix = activity.fromMe ? "↩ you: " : ""
  const preview = activity.preview ?? ""
  const at =
    activity.at === null
      ? ""
      : ` · ${new Date(activity.at).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })}`
  return `${prefix}${preview}${at}`
}

type ChatHistoryTarget = Readonly<{ chat: SessionChat; ref: string }>

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
  const [history, setHistory] = useState<ChatHistoryTarget | null>(null)
  const [messages, setMessages] = useState<ResourceState<readonly MessageView[]>>({
    kind: "loading",
  })

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

  useEffect(() => {
    if (history === null) return
    let isCurrent = true
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    setMessages({ kind: "loading" })
    // WAHA materializes chat history lazily: a cold store can answer 200 with
    // an empty array, so a single empty result is retried once before shown.
    const load = (attempt: number): void => {
      void api.messages(scope, sessionId, history.ref).then((result) => {
        if (!isCurrent) return
        if (attempt < 1 && result.kind === "ready" && result.data.length === 0) {
          retryTimer = setTimeout(() => {
            if (isCurrent) load(attempt + 1)
          }, 1500)
          return
        }
        setMessages(resourceFromResult(result))
      })
    }
    load(0)
    return () => {
      isCurrent = false
      if (retryTimer !== undefined) clearTimeout(retryTimer)
    }
  }, [api, scope, sessionId, history])

  useEffect(() => {
    if (history === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistory(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [history])

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
        <p className="chat-directory-copy">
          Selecting a contact only fills the recipient; sending still requires your final submit.
        </p>
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
          {filtered.map((chat, index) => {
            const activityLine = directoryActivityLine(chat)
            const chatRef = chat.ref
            const selected = selectedChatId === chat.phone
            return (
              <div className="directory-row" key={directoryChatKey(chat, index)}>
                <button
                  className={`directory-item${selected ? " is-selected" : ""}`}
                  type="button"
                  onClick={() => onSelect?.(chat)}
                  disabled={disabled || directoryContactTarget(chat) === undefined}
                  aria-pressed={selected}
                >
                  <strong>{chat.name ?? "Unnamed chat"}</strong>
                  <span>{directoryContactDescription(chat)}</span>
                  {activityLine ? <span className="directory-preview">{activityLine}</span> : null}
                  {selected ? <span className="directory-selection">Selected</span> : null}
                </button>
                {typeof chatRef === "string" ? (
                  <button
                    className="button button-secondary directory-chat-button"
                    type="button"
                    aria-label={`View chat history for ${historyChatLabel(chat)}`}
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      setHistory({ chat, ref: chatRef })
                    }}
                  >
                    Chat
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {history === null ? null : (
        <ChatHistoryOverlay
          chat={history.chat}
          messages={messages}
          onClose={() => setHistory(null)}
        />
      )}
    </section>
  )
}
