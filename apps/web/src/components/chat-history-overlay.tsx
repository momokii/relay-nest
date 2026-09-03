import type * as React from "react"
import { useEffect, useRef, useState } from "react"
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
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const api = createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (previewImage === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setPreviewImage(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [previewImage])

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
              const messageId = message.id
              const isImage =
                message.hasMedia &&
                typeof messageId === "string" &&
                (message.mimetype?.startsWith("image/") ?? true)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the server redacts provider message ids, so position in the immutable snapshot is the only stable key
                <li className="chat-history-entry" key={`chat-history-${index}`}>
                  <div className="chat-history-meta">
                    <span className="chat-history-direction">
                      {message.direction === "out"
                        ? "you"
                        : message.direction === "in"
                          ? (message.sender ?? historyChatLabel(chat))
                          : "unknown"}
                    </span>
                    <span>{historyTime(message.at)}</span>
                  </div>
                  {isImage && typeof messageId === "string" ? (
                    <button
                      type="button"
                      className="chat-history-media-button"
                      onClick={() =>
                        setPreviewImage(api.messageMediaUrl(scope, sessionId, chatRef, messageId))
                      }
                      aria-label="View full image"
                    >
                      <img
                        className="chat-history-media"
                        src={api.messageMediaUrl(scope, sessionId, chatRef, messageId)}
                        alt={message.preview ?? "Image"}
                        loading="lazy"
                      />
                    </button>
                  ) : null}
                  <p className="chat-history-preview">{message.preview ?? "—"}</p>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      {previewImage ? (
        <button
          type="button"
          className="chat-history-lightbox"
          onClick={() => setPreviewImage(null)}
          aria-label="Close full image view"
        >
          <img className="chat-history-lightbox-image" src={previewImage} alt="Enlarged preview" />
        </button>
      ) : null}
    </div>
  )

  if (typeof document === "undefined") return overlay
  return createPortal(overlay, document.body)
}
