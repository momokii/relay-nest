import type * as React from "react"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import type { AccountScope } from "../dashboard-model"
import type { MessageView, SessionChat } from "../dashboard-session-api"
import { createDashboardSessionApi } from "../dashboard-session-api"
import type { ResourceState } from "../dashboard-state"
import { LoadingRows, StateNotice } from "./ui"

export function historyChatLabel(chat: SessionChat): string {
  return chat.name ?? chat.phone ?? "Unnamed chat"
}

function historyTime(at: string | null): string {
  if (at === null) return "—"
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ChatHistoryOverlay({
  chat,
  messages,
  scope,
  sessionId,
  chatRef,
  onRetry,
  onClose,
}: Readonly<{
  chat: SessionChat
  messages: ResourceState<readonly MessageView[]>
  scope: AccountScope
  sessionId: string
  chatRef: string
  onRetry: () => void
  onClose: () => void
}>): React.JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const api = createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  const overlay = (
    <div className="chat-history-backdrop">
      <div
        className="chat-history-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Chat history · ${historyChatLabel(chat)}`}
      >
        <div className="chat-history-header">
          <strong>{historyChatLabel(chat)}</strong>
          <button
            className="button button-secondary"
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {messages.kind === "loading" ? (
          <>
            <LoadingRows count={3} />
            <p className="chat-history-loading-copy">
              Fetching history from WhatsApp. First load after a restart can take up to 30 seconds —
              later opens are instant.
            </p>
          </>
        ) : null}
        {messages.kind === "error" ||
        messages.kind === "unavailable" ||
        messages.kind === "denied" ? (
          <StateNotice title="Chat history unavailable" message={messages.message} tone="warning" />
        ) : null}
        {messages.kind === "ready" && messages.data.length === 0 ? (
          <StateNotice
            title="No messages yet"
            message="WhatsApp may still be loading this chat's history. Try again, or reopen this panel in a moment."
            tone="warning"
            action={
              <button className="button button-secondary" type="button" onClick={onRetry}>
                Try again
              </button>
            }
          />
        ) : null}
        {messages.kind === "ready" && messages.data.length > 0 ? (
          <ul className="chat-history-list">
            {messages.data.map((message, index) => {
              const isImage =
                message.hasMedia &&
                typeof message.id === "string" &&
                (message.mimetype?.startsWith("image/") ?? true)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the server redacts provider message ids, so position in the immutable snapshot is the only stable key
                <li className="chat-history-entry" key={`chat-history-${index}`}>
                  <div className="chat-history-meta">
                    <span className="chat-history-direction">
                      {message.direction === "out"
                        ? "you"
                        : message.direction === "in"
                          ? historyChatLabel(chat)
                          : "unknown"}
                    </span>
                    <span>{historyTime(message.at)}</span>
                  </div>
                  {isImage && typeof message.id === "string" ? (
                    <img
                      className="chat-history-media"
                      src={api.messageMediaUrl(scope, sessionId, chatRef, message.id)}
                      alt={message.preview ?? "Image"}
                      loading="lazy"
                    />
                  ) : null}
                  <p className="chat-history-preview">{message.preview ?? "—"}</p>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )

  if (typeof document === "undefined") return overlay
  return createPortal(overlay, document.body)
}
