import type * as React from "react"
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react"

import type { SessionView } from "../dashboard-api"
import type { AccountScope } from "../dashboard-model"
import { createDashboardSessionApi, type SessionQr } from "../dashboard-session-api"
import type { ActionState } from "../dashboard-state"
import { runAutoLink } from "../session-auto-link"
import { Panel, StateNotice, StatusBadge } from "./ui"

export function qrImageSource(value: string): string | null {
  return value.startsWith("data:image/") ? value : null
}

function ConnectActionFeedback({
  action,
}: Readonly<{ action: ActionState<SessionQr | null> }>): React.JSX.Element | null {
  switch (action.kind) {
    case "idle":
    case "submitting":
      return null
    case "ready":
      return null
    case "unavailable":
      return (
        <StateNotice title="Unavailable" message={action.message} tone="warning" live="polite" />
      )
    case "denied":
      return (
        <StateNotice title="Server denied" message={action.message} tone="error" live="polite" />
      )
    case "error":
      return (
        <StateNotice
          title="Could not complete"
          message={action.message}
          tone="error"
          live="polite"
        />
      )
    default:
      return null
  }
}

export function SessionConnectPanel({
  scope,
  session,
  autoLinkSessionId = "",
}: Readonly<{
  scope: AccountScope
  session: SessionView
  autoLinkSessionId?: string
}>): React.JSX.Element {
  const api = useMemo(() => createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL), [])
  const [qrAction, setQrAction] = useState<ActionState<SessionQr | null>>({ kind: "idle" })
  const [pairingAction, setPairingAction] = useState<ActionState<SessionQr | null>>({
    kind: "idle",
  })
  const [qr, setQr] = useState<SessionQr | null>(null)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const displayStatus = liveStatus ?? session.status
  const linkedSessionRef = useRef<string | null>(null)
  const unmountedRef = useRef(false)
  const autoLoadedStatusRef = useRef("")
  const loadQrRef = useRef<() => void>(() => undefined)

  const loadQr = (): void => {
    setQrAction({ kind: "submitting" })
    void api.qr(scope, session.id).then((result) => {
      const next =
        result.kind === "ready"
          ? ({ kind: "ready", data: result.data } as ActionState<SessionQr | null>)
          : result
      setQrAction(next)
      if (result.kind === "ready") setQr(result.data)
    })
  }
  loadQrRef.current = loadQr

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (autoLinkSessionId === "" || autoLinkSessionId !== session.id) return
    if (linkedSessionRef.current === session.id) return
    linkedSessionRef.current = session.id
    void runAutoLink({
      start: async () => {
        const result = await api.lifecycle(scope, session.id, "start", false)
        if (result.kind !== "ready") throw new Error(result.message)
      },
      fetchStatus: async () => {
        const result = await api.get(scope, session.id)
        return result.kind === "ready" ? result.data.status : ""
      },
      onStatus: (status) => {
        if (!unmountedRef.current) setLiveStatus(status)
      },
      loadQr: () => loadQrRef.current(),
      delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      isCancelled: () => unmountedRef.current || linkedSessionRef.current !== session.id,
    })
  }, [api, autoLinkSessionId, scope, session.id])

  useEffect(() => {
    if (session.status.trim().toLowerCase() !== "scan_qr_code") return
    if (qr !== null || autoLoadedStatusRef.current === session.status) return
    autoLoadedStatusRef.current = session.status
    loadQrRef.current()
  }, [qr, session.status])

  const requestPairingCode = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setPairingAction({ kind: "submitting" })
    void api.pairingCode(scope, session.id, phoneNumber).then((result) => {
      const next =
        result.kind === "ready"
          ? ({ kind: "ready", data: null } as ActionState<SessionQr | null>)
          : result
      setPairingAction(next)
    })
  }

  const source = qr === null ? null : qrImageSource(qr.value)

  return (
    <Panel
      eyebrow="Provider link"
      title="Connect WhatsApp"
      description="Connect the linked session to a WhatsApp account. The provider stays server-side; nothing is exposed beyond this dashboard."
      tone="inset"
    >
      <div className="status-list">
        <StatusBadge label={`Provider · ${displayStatus}`} />
      </div>
      {displayStatus.toLowerCase() !== "working" && displayStatus !== "scan_qr_code" ? (
        <StateNotice
          title="Session not connected yet"
          message="Start the session, then scan the QR code below with the phone that owns the WhatsApp account."
        />
      ) : null}
      {liveStatus === "start_failed" ? (
        <StateNotice
          title="Could not start the session"
          message="The start command was not accepted for this session. Check the session state and try Start again."
          tone="error"
          live="polite"
        />
      ) : null}
      {liveStatus === "linking_timeout" ? (
        <StateNotice
          title="Waiting for the QR state"
          message="The session did not reach the QR-scan state within 30 seconds. Use Refresh QR code in a moment."
          tone="warning"
          live="polite"
        />
      ) : null}
      <div className="form-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={loadQr}
          disabled={qrAction.kind === "submitting"}
          aria-busy={qrAction.kind === "submitting" ? "true" : "false"}
        >
          {qrAction.kind === "submitting"
            ? "Loading QR…"
            : qr === null
              ? "Show QR code"
              : "Refresh QR code"}
        </button>
      </div>
      <ConnectActionFeedback action={qrAction} />
      {source !== null ? (
        <div className="qr-frame">
          <img src={source} alt="WhatsApp link QR code" width={240} height={240} />
          <p>
            Open WhatsApp on the phone → Settings → Linked devices → Link a device, then point the
            camera at this code.
          </p>
        </div>
      ) : qr !== null ? (
        <div className="qr-frame">
          <code>{qr.value}</code>
          <p>The provider returned this QR payload as text; scan or paste it into the phone.</p>
        </div>
      ) : null}
      <form className="operational-form" onSubmit={requestPairingCode}>
        <label>
          <span>Phone number (pairing code instead of QR)</span>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+6281234567890"
            required
          />
        </label>
        <button
          className="button button-secondary"
          type="submit"
          disabled={pairingAction.kind === "submitting"}
          aria-busy={pairingAction.kind === "submitting" ? "true" : "false"}
        >
          {pairingAction.kind === "submitting" ? "Requesting…" : "Request pairing code"}
        </button>
      </form>
      {pairingAction.kind === "ready" ? (
        <StateNotice
          title="Pairing code requested"
          message="On the phone, open WhatsApp → Settings → Linked devices → Link with phone number instead, and enter the code shown there."
          live="polite"
        />
      ) : null}
      <ConnectActionFeedback action={pairingAction} />
    </Panel>
  )
}
