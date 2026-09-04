import * as React from "react"
import { useState } from "react"
import type { CampaignApi, CampaignInput } from "../campaign-api"
import type { SessionView } from "../dashboard-api"
import type { AccountScope } from "../dashboard-model"
import { renderPreview } from "../lib/whatsapp-format"
import { CampaignGroupPicker } from "./campaign-group-picker"
import { Panel } from "./ui"

function previewNode(node: ChildNode, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const children = Array.from(node.childNodes).map((child, index) => previewNode(child, index))
  switch (node.nodeName.toLowerCase()) {
    case "strong":
      return React.createElement("strong", { key }, children)
    case "em":
      return React.createElement("em", { key }, children)
    case "s":
      return React.createElement("s", { key }, children)
    case "code":
      return React.createElement("code", { key }, children)
    case "ul":
      return React.createElement("ul", { key }, children)
    case "ol":
      return React.createElement("ol", { key }, children)
    case "li":
      return React.createElement("li", { key }, children)
    default:
      return null
  }
}

function previewNodes(text: string): readonly React.ReactNode[] {
  const document = new DOMParser().parseFromString(renderPreview(text), "text/html")
  return Array.from(document.body.childNodes).map((node, index) => previewNode(node, index))
}

export function CampaignForm({
  scope,
  role,
  sessions,
  api,
  onCreated,
}: Readonly<{
  scope: AccountScope
  role: string
  sessions: readonly SessionView[]
  api: CampaignApi
  onCreated: () => void
}>): React.JSX.Element {
  const [sessionId, setSessionId] = useState("")
  const [groupIds, setGroupIds] = useState<readonly string[]>([])
  const [wahaGroupId, setWahaGroupId] = useState("")
  const [targetMode, setTargetMode] = useState<"waha" | "custom">("waha")
  const [message, setMessage] = useState("")
  const [followUp, setFollowUp] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [timezone, setTimezone] = useState("Asia/Jakarta")
  const [sendMode, setSendMode] = useState<"now" | "later">("now")
  const [trigger, setTrigger] = useState<"any" | "emoji">("any")
  const [emojiMap, setEmojiMap] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const contactGroupId = groupIds[0]
    if (!sessionId) {
      setError("Pick an authorized session first — it’s required for both contact and WAHA groups.")
      return
    }
    if (!contactGroupId) {
      setError(
        "Pick at least one contact group — check the box next to a group name, or create a new one and it will be auto-selected.",
      )
      return
    }
    if (!message.trim()) {
      setError("Write the group message — it can’t be empty.")
      return
    }
    if (targetMode === "waha" && !wahaGroupId) {
      setError("Choose a WAHA group for the broadcast, or switch to Custom group.")
      return
    }
    if (sendMode === "later" && !scheduledAt) {
      setError("Choose a schedule time or switch to Send now.")
      return
    }
    setBusy(true)
    setError("")
    const input: CampaignInput = {
      sessionId,
      contactGroupId,
      ...(targetMode === "waha" && wahaGroupId ? { wahaGroupId } : {}),
      message: message.trim(),
      ...(followUp.trim() ? { followUpMessage: followUp.trim() } : {}),
      trigger:
        trigger === "any"
          ? { type: "any" }
          : {
              type: "emoji",
              emojiMap: Object.fromEntries(
                emojiMap
                  .split(",")
                  .map((item) => item.split(":").map((part) => part.trim()))
                  .filter((item) => item.length === 2 && item[0] && item[1]),
              ),
            },
      ...(sendMode === "later" && scheduledAt ? { scheduledAt, timezone } : {}),
    }
    const result = await api.create(scope, input)
    setBusy(false)
    if (result.kind === "ready") {
      setMessage("")
      setFollowUp("")
      setScheduledAt("")
      onCreated()
    } else setError(result.message)
  }
  return (
    <Panel
      eyebrow="Operator configured"
      title="Create reaction campaign"
      description={
        role === "viewer"
          ? "Viewer access is read-only."
          : "Create a contact list, pick a WhatsApp group, schedule the first message, and set who gets the follow-up when they react."
      }
    >
      <div
        className="campaign-instructions"
        style={{
          display: "grid",
          gap: "var(--space-2)",
          padding: "var(--space-3)",
          background: "var(--color-inset)",
          borderRadius: "var(--radius-control)",
          fontSize: "var(--type-small)",
          color: "var(--color-muted)",
        }}
      >
        <strong style={{ color: "var(--color-ink)" }}>How it works</strong>
        <ol
          style={{
            margin: 0,
            paddingLeft: "var(--space-5)",
            display: "grid",
            gap: "var(--space-1)",
          }}
        >
          <li>
            <strong style={{ color: "var(--color-ink)" }}>Contacts group</strong> — your app-owned
            list (e.g., “PTG Batch 1” with 40 contacts). Reusable across campaigns, scoped to
            Personal/Business.
          </li>
          <li>
            <strong style={{ color: "var(--color-ink)" }}>WAHA group</strong> — the real WhatsApp
            group (@g.us like “Product ber 4”). This is where the first message is broadcast.
          </li>
          <li>
            Pick the authorized session and the WAHA group — its current members will be shown
            below. Contacts from your selected contact group become the <em>allowlist</em> for who
            is eligible for the follow-up.
          </li>
          <li>
            Write the group message and an optional follow-up. The group message goes at the chosen
            time (or immediately if “Send now”); the follow-up is sent{" "}
            <strong style={{ color: "var(--color-ink)" }}>only to the person who reacted</strong> (1
            of 40, not all 40), as a 1:1 message, checked for consent and safety.
          </li>
        </ol>
        <small>
          All messages stay as text with WhatsApp formatting (*bold* _italic_ etc.) and are scoped
          to Personal/Business.
        </small>
      </div>
      <form className="operational-form campaign-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="campaign-trigger">
          <legend>Target</legend>
          <label>
            <input
              type="radio"
              checked={targetMode === "waha"}
              onChange={() => setTargetMode("waha")}
            />{" "}
            WAHA group — broadcast to an existing WhatsApp group
          </label>
          <label>
            <input
              type="radio"
              checked={targetMode === "custom"}
              onChange={() => setTargetMode("custom")}
            />{" "}
            Custom group — use only your contact group (no WAHA group needed)
          </label>
          <small>
            {targetMode === "waha"
              ? "Pick a WAHA group below for the broadcast."
              : "No WAHA group needed. The campaign will use your contact group as the custom target."}
          </small>
        </fieldset>
        <CampaignGroupPicker
          scope={scope}
          sessions={sessions}
          api={api}
          contactGroupIds={groupIds}
          wahaGroupId={wahaGroupId}
          sessionId={sessionId}
          targetMode={targetMode}
          onContactGroups={setGroupIds}
          onWahaGroup={setWahaGroupId}
          onSession={setSessionId}
        />
        <label>
          <span>Group message — sent to the WAHA group at the scheduled time</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            maxLength={4096}
            placeholder="e.g., Hello team *update* for tomorrow _please react_ 👍 to confirm"
          />
        </label>
        <section className="campaign-preview" aria-label="Message preview">
          <span>Live WhatsApp preview</span>
          <div>{previewNodes(message)}</div>
        </section>
        <label>
          <span>Follow-up — sent 1:1 only to the person who reacted (not to all 40)</span>
          <textarea
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            rows={3}
            maxLength={4096}
            placeholder="e.g., Thanks for reacting! Here is the next step for you."
          />
        </label>
        <fieldset className="campaign-trigger">
          <legend>Trigger matching</legend>
          <label>
            <input type="radio" checked={trigger === "any"} onChange={() => setTrigger("any")} />{" "}
            Any emoji (default)
          </label>
          <label>
            <input
              type="radio"
              checked={trigger === "emoji"}
              onChange={() => setTrigger("emoji")}
            />{" "}
            Per emoji
          </label>
          {trigger === "emoji" ? (
            <label>
              <span>Emoji map</span>
              <input
                value={emojiMap}
                onChange={(event) => setEmojiMap(event.target.value)}
                placeholder="👍:Thanks, ❤️:Appreciate it"
              />
              <small>Comma-separated emoji:text pairs.</small>
            </label>
          ) : null}
        </fieldset>
        <fieldset className="campaign-trigger">
          <legend>Group message timing</legend>
          <label>
            <input type="radio" checked={sendMode === "now"} onChange={() => setSendMode("now")} />{" "}
            Send now — group message goes immediately, reactions still trigger the 1:1 follow-up
          </label>
          <label>
            <input
              type="radio"
              checked={sendMode === "later"}
              onChange={() => setSendMode("later")}
            />{" "}
            Schedule for later
          </label>
        </fieldset>
        {sendMode === "later" ? (
          <div className="form-grid">
            <label>
              <span>Group message send time</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
              <small>
                Scheduled in the selected timezone. The reaction trigger still runs immediately
                after someone reacts.
              </small>
            </label>
            <label>
              <span>Timezone</span>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                <option>Asia/Jakarta</option>
                <option>UTC</option>
                <option>Asia/Singapore</option>
                <option>Europe/London</option>
              </select>
            </label>
          </div>
        ) : null}
        {error ? (
          <div role="alert" style={{ display: "grid", gap: "var(--space-2)" }}>
            <div
              className="state-notice state-error"
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-control)",
                background: "color-mix(in srgb, var(--color-error) 12%, var(--color-surface))",
                border: "1px solid var(--color-error)",
              }}
            >
              <strong style={{ display: "block", marginBottom: "var(--space-1)" }}>
                Could not create campaign
              </strong>
              <span>{error}</span>
              {error.includes("503") || error.toLowerCase().includes("unavailable") ? (
                <small
                  style={{
                    display: "block",
                    marginTop: "var(--space-2)",
                    color: "var(--color-muted)",
                  }}
                >
                  The campaign service returned 503 — it may be temporarily unavailable or the WAHA
                  group is not in this session. Try refreshing, picking a different WAHA group, or
                  check server logs.
                </small>
              ) : null}
            </div>
          </div>
        ) : null}
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || role === "viewer"}
          aria-busy={busy}
        >
          {busy ? "Creating…" : "Create campaign"}
        </button>
      </form>
    </Panel>
  )
}
