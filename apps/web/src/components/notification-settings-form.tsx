import type * as React from "react"
import { useState } from "react"

import type { AccountScope } from "../dashboard-model"
import type { NotificationSettingsInput } from "../dashboard-notification-api"
import type { ActionState } from "../dashboard-state"
import { StateNotice } from "./ui"

export function NotificationSettingsForm({
  scope,
  action,
  onSave,
}: Readonly<{
  scope: AccountScope
  action: ActionState<unknown>
  onSave: (scope: AccountScope, input: NotificationSettingsInput) => Promise<void>
}>): React.JSX.Element {
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [host, setHost] = useState("")
  const [port, setPort] = useState("465")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [from, setFrom] = useState("")
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [botToken, setBotToken] = useState("")
  const [chatIds, setChatIds] = useState("")

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void onSave(scope, {
      email: {
        enabled: emailEnabled,
        host,
        port: Number(port),
        secure: true,
        username,
        password,
        from,
      },
      telegram: {
        enabled: telegramEnabled,
        botToken,
        chatIds: chatIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      },
    })
  }

  return (
    <form className="operational-form" onSubmit={submit}>
      <h3>Replace provider settings</h3>
      <label>
        <span>Email host</span>
        <input
          value={host}
          onChange={(event) => setHost(event.target.value)}
          required={emailEnabled}
        />
      </label>
      <label>
        <span>Email port</span>
        <input
          type="number"
          value={port}
          onChange={(event) => setPort(event.target.value)}
          required={emailEnabled}
        />
      </label>
      <label>
        <span>Email username</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required={emailEnabled}
        />
      </label>
      <label>
        <span>Email password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required={emailEnabled}
        />
      </label>
      <label>
        <span>Email from</span>
        <input
          type="email"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          required={emailEnabled}
        />
      </label>
      <label>
        <span>
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(event) => setEmailEnabled(event.target.checked)}
          />{" "}
          Enable email
        </span>
      </label>
      <label>
        <span>Telegram bot token</span>
        <input
          type="password"
          value={botToken}
          onChange={(event) => setBotToken(event.target.value)}
          required={telegramEnabled}
        />
      </label>
      <label>
        <span>Telegram chat IDs</span>
        <input
          value={chatIds}
          onChange={(event) => setChatIds(event.target.value)}
          placeholder="chat-id-1, chat-id-2"
          required={telegramEnabled}
        />
      </label>
      <label>
        <span>
          <input
            type="checkbox"
            checked={telegramEnabled}
            onChange={(event) => setTelegramEnabled(event.target.checked)}
          />{" "}
          Enable Telegram
        </span>
      </label>
      <button
        className="button button-secondary"
        type="submit"
        disabled={action.kind === "submitting"}
      >
        {action.kind === "submitting" ? "Saving…" : "Save provider settings"}
      </button>
      {action.kind === "ready" ? (
        <StateNotice
          title="Settings saved"
          message="Provider settings were accepted by the authenticated Admin route."
        />
      ) : null}
      {action.kind === "denied" || action.kind === "error" || action.kind === "unavailable" ? (
        <StateNotice title="Settings unavailable" message={action.message} tone="error" />
      ) : null}
    </form>
  )
}
