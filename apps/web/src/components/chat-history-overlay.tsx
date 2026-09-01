import type * as React from "react"

import type { MessageView, SessionChat } from "../dashboard-session-api"
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
  onClose,
}: Readonly<{
  chat: SessionChat
  messages: ResourceState<readonly MessageView[]>
  onClose: () => void
}>): React.JSX.Element {
  return (
    <div className="chat-history-backdrop">
      <div
        className="chat-history-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Chat history · ${historyChatLabel(chat)}`}
      >
        <div className="chat-history-header">
          <strong>{historyChatLabel(chat)}</strong>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {messages.kind === "loading" ? <LoadingRows count={3} /> : null}
        {messages.kind === "error" ||
        messages.kind === "unavailable" ||
        messages.kind === "denied" ? (
          <StateNotice title="Chat history unavailable" message={messages.message} tone="warning" />
        ) : null}
        {messages.kind === "ready" && messages.data.length === 0 ? (
          <StateNotice
            title="No messages"
            message="This chat has no recent messages to show."
            tone="warning"
          />
        ) : null}
        {messages.kind === "ready" && messages.data.length > 0 ? (
          <ul className="chat-history-list">
            {messages.data.map((message, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the server redacts provider message ids, so position in the immutable snapshot is the only stable key
              <li className="chat-history-entry" key={`chat-history-${index}`}>
                <div className="chat-history-meta">
                  <span className="chat-history-direction">
                    {message.direction === "out"
                      ? "you"
                      : message.direction === "in"
                        ? "them"
                        : "unknown"}
                  </span>
                  <span>{historyTime(message.at)}</span>
                </div>
                <p className="chat-history-preview">{message.preview ?? "—"}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
