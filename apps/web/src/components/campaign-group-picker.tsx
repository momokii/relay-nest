import type * as React from "react"
import { useEffect, useState } from "react"
import type { CampaignApi, ContactGroup, WahaGroup } from "../campaign-api"
import type { SessionView } from "../dashboard-api"
import type { AccountScope } from "../dashboard-model"
import { StateNotice } from "./ui"

export function CampaignGroupPicker({
  scope,
  sessions,
  api,
  contactGroupIds,
  wahaGroupId,
  sessionId,
  onContactGroups,
  onWahaGroup,
  onSession,
}: Readonly<{
  scope: AccountScope
  sessions: readonly SessionView[]
  api: CampaignApi
  contactGroupIds: readonly string[]
  wahaGroupId: string
  sessionId: string
  onContactGroups: (ids: readonly string[]) => void
  onWahaGroup: (id: string) => void
  onSession: (id: string) => void
}>): React.JSX.Element {
  const [contactGroups, setContactGroups] = useState<readonly ContactGroup[]>([])
  const [wahaGroups, setWahaGroups] = useState<readonly WahaGroup[]>([])
  const [newGroupName, setNewGroupName] = useState("")
  const [message, setMessage] = useState("Loading groups…")
  const selectedWaha = wahaGroups.find((group) => group.id === wahaGroupId) ?? null
  useEffect(() => {
    let current = true
    void api.contactGroups(scope).then((result) => {
      if (!current) return
      if (result.kind === "ready") {
        setContactGroups(result.data)
        setMessage("")
      } else setMessage("Contact groups are unavailable in this scope.")
    })
    return () => {
      current = false
    }
  }, [api, scope])
  useEffect(() => {
    if (!sessionId) {
      setWahaGroups([])
      return
    }
    let current = true
    setMessage("Loading WAHA groups…")
    void api.wahaGroups(scope, sessionId).then((result) => {
      if (!current) return
      if (result.kind === "ready") {
        setWahaGroups(result.data)
        setMessage("")
      } else {
        setWahaGroups([])
        setMessage("WAHA groups require an authorized session grant.")
      }
    })
    return () => {
      current = false
    }
  }, [api, scope, sessionId])
  const toggleContact = (id: string): void =>
    onContactGroups(
      contactGroupIds.includes(id)
        ? contactGroupIds.filter((item) => item !== id)
        : [...contactGroupIds, id],
    )
  return (
    <div className="campaign-picker-grid">
      <label>
        <span>Authorized session</span>
        <select value={sessionId} onChange={(event) => onSession(event.target.value)}>
          <option value="">Select a granted session</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </select>
        <small>WAHA groups are requested only after this grant-backed choice.</small>
      </label>
      <fieldset className="campaign-choice-list">
        <legend>Contact groups</legend>
        <div className="campaign-inline-action">
          <input
            aria-label="New contact group name"
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="New contact group"
          />
          <button
            className="button button-secondary"
            type="button"
            disabled={!newGroupName.trim()}
            onClick={() => {
              void api.createContactGroup(scope, newGroupName.trim()).then((result) => {
                if (result.kind === "ready") {
                  setContactGroups((current) => [...current, result.data])
                  onContactGroups([...contactGroupIds, result.data.id])
                  setNewGroupName("")
                }
              })
            }}
          >
            Create group
          </button>
        </div>
        {contactGroups.length === 0 ? (
          <StateNotice
            title="No contact groups"
            message={message || "Create a contact group before scheduling."}
          />
        ) : (
          contactGroups.map((group) => (
            <label className="campaign-choice" key={group.id}>
              <input
                type="checkbox"
                checked={contactGroupIds.includes(group.id)}
                onChange={() => toggleContact(group.id)}
              />
              <span>{group.name}</span>
            </label>
          ))
        )}
      </fieldset>
      <label>
        <span>WAHA group</span>
        <select
          value={wahaGroupId}
          onChange={(event) => onWahaGroup(event.target.value)}
          disabled={!sessionId}
        >
          <option value="">Select a WAHA group</option>
          {wahaGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name ?? group.subject ?? group.id}
            </option>
          ))}
        </select>
        <small>
          {sessionId
            ? "Group names come from the server; credentials never reach the browser."
            : "Select an authorized session first."}
        </small>
      </label>
      {selectedWaha ? (
        <div
          className="campaign-waha-detail"
          style={{
            display: "grid",
            gap: "var(--space-2)",
            padding: "var(--space-3)",
            background: "var(--color-inset)",
            borderRadius: "var(--radius-control)",
          }}
        >
          <strong style={{ fontSize: "var(--type-small)" }}>
            {selectedWaha.name ?? selectedWaha.subject ?? selectedWaha.id}
          </strong>
          <span style={{ color: "var(--color-muted)", fontSize: "var(--type-caption)" }}>
            {selectedWaha.participants?.length
              ? `${selectedWaha.participants.length} members in WAHA group`
              : "No participant list returned for this WAHA group."}
          </span>
          {selectedWaha.participants?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
              {selectedWaha.participants.slice(0, 12).map((participant) => (
                <span
                  key={participant}
                  className="status-badge status-info"
                  style={{ fontSize: "var(--type-caption)" }}
                >
                  {participant}
                </span>
              ))}
              {selectedWaha.participants.length > 12 ? (
                <span style={{ fontSize: "var(--type-caption)", color: "var(--color-muted)" }}>
                  +{selectedWaha.participants.length - 12} more
                </span>
              ) : null}
            </div>
          ) : null}
          <small>
            Contacts from your selected contact group(s) will be matched for the follow-up
            allowlist. To add more people to this WAHA group, use the contact group below and the
            group will be updated on campaign creation.
          </small>
        </div>
      ) : null}
      {contactGroupIds.length > 0 ? (
        <div
          className="campaign-contact-preview"
          style={{
            display: "grid",
            gap: "var(--space-1)",
            padding: "var(--space-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-control)",
          }}
        >
          <span style={{ fontSize: "var(--type-small)", fontWeight: 600 }}>
            Selected contact groups: {contactGroupIds.length}
          </span>
          <small>
            On reaction, only the reactor (1 of {selectedWaha?.participants?.length ?? 40} or your
            selected list) receives the 1:1 follow-up — not the whole group. This is the allowlist
            for who is eligible.
          </small>
        </div>
      ) : null}
    </div>
  )
}
