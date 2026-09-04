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
  const [message, setMessage] = useState("")
  const [followUp, setFollowUp] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [timezone, setTimezone] = useState("UTC")
  const [trigger, setTrigger] = useState<"any" | "emoji">("any")
  const [emojiMap, setEmojiMap] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const contactGroupId = groupIds[0]
    if (!sessionId || !contactGroupId || !wahaGroupId || !message.trim() || !scheduledAt) {
      setError(
        "Choose a session, at least one contact group, WAHA group, message, and schedule time.",
      )
      return
    }
    setBusy(true)
    setError("")
    const input: CampaignInput = {
      sessionId,
      contactGroupId,
      wahaGroupId,
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
      scheduledAt,
      timezone,
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
          : "A campaign is one scheduled, scoped reaction workflow. Messages are rendered as text only."
      }
    >
      <form className="operational-form campaign-form" onSubmit={(event) => void submit(event)}>
        <CampaignGroupPicker
          scope={scope}
          sessions={sessions}
          api={api}
          contactGroupIds={groupIds}
          wahaGroupId={wahaGroupId}
          sessionId={sessionId}
          onContactGroups={setGroupIds}
          onWahaGroup={setWahaGroupId}
          onSession={setSessionId}
        />
        <label>
          <span>Message</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            maxLength={4096}
            placeholder="Write the human-approved reaction message."
          />
        </label>
        <section className="campaign-preview" aria-label="Message preview">
          <span>Parser preview</span>
          <div>{previewNodes(message)}</div>
        </section>
        <label>
          <span>Follow-up message (optional)</span>
          <textarea
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            rows={3}
            maxLength={4096}
            placeholder="Sent after the initial reaction when configured."
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
        <div className="form-grid">
          <label>
            <span>Schedule date and time</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <label>
            <span>Timezone</span>
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              <option>UTC</option>
              <option>Asia/Jakarta</option>
              <option>Asia/Singapore</option>
              <option>Europe/London</option>
            </select>
          </label>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
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
