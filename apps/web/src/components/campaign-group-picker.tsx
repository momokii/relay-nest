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
  targetMode,
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
  targetMode?: "waha" | "custom"
  onContactGroups: (ids: readonly string[]) => void
  onWahaGroup: (id: string) => void
  onSession: (id: string) => void
}>): React.JSX.Element {
  const [contactGroups, setContactGroups] = useState<readonly ContactGroup[]>([])
  const [wahaGroups, setWahaGroups] = useState<readonly WahaGroup[]>([])
  const [newGroupName, setNewGroupName] = useState("")
  const [message, setMessage] = useState("Loading groups…")
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<readonly { id: string; phone: string | null }[]>([])
  const [newPhone, setNewPhone] = useState("")
  const [availableContacts, setAvailableContacts] = useState<
    readonly { phone: string; name: string | null }[]
  >([])
  const [confirmDelete, setConfirmDelete] = useState<ContactGroup | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
  useEffect(() => {
    if (!sessionId) {
      setAvailableContacts([])
      return
    }
    let current = true
    // Use the same chats endpoint as the directory to offer existing WhatsApp contacts
    import("../dashboard-session-api").then(({ createDashboardSessionApi }) => {
      const sessionApi = createDashboardSessionApi(import.meta.env.VITE_API_BASE_URL)
      void sessionApi.chats(scope, sessionId).then((result) => {
        if (!current) return
        if (result.kind === "ready") {
          const contacts = result.data
            .filter((chat) => !chat.isGroup && chat.phone)
            .map((chat) => ({ phone: chat.phone as string, name: chat.name }))
            .slice(0, 50)
          setAvailableContacts(contacts)
        }
      })
    })
    return () => {
      current = false
    }
  }, [scope, sessionId])
  const toggleContact = (id: string): void =>
    onContactGroups(
      contactGroupIds.includes(id)
        ? contactGroupIds.filter((item) => item !== id)
        : [...contactGroupIds, id],
    )
  useEffect(() => {
    if (!editingGroupId) {
      setMembers([])
      return
    }
    let current = true
    void api.contactGroupMembers(scope, editingGroupId).then((result) => {
      if (!current) return
      if (result.kind === "ready") setMembers(result.data)
      else setMembers([])
    })
    return () => {
      current = false
    }
  }, [api, scope, editingGroupId])
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
            <div
              key={group.id}
              style={{
                display: "grid",
                gap: "var(--space-1)",
                padding: "var(--space-2)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-control)",
                background: contactGroupIds.includes(group.id)
                  ? "var(--color-inset)"
                  : "transparent",
              }}
            >
              <label
                className="campaign-choice"
                style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
              >
                <input
                  type="checkbox"
                  checked={contactGroupIds.includes(group.id)}
                  onChange={() => toggleContact(group.id)}
                />
                <span style={{ flex: 1 }}>
                  {group.name} —{" "}
                  <small style={{ color: "var(--color-muted)" }}>
                    {editingGroupId === group.id
                      ? `${members.length} contacts`
                      : "click Manage to see contacts"}
                  </small>
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{
                    padding: "var(--space-1) var(--space-2)",
                    fontSize: "var(--type-caption)",
                  }}
                  onClick={() => setEditingGroupId(editingGroupId === group.id ? null : group.id)}
                >
                  {editingGroupId === group.id ? "Hide" : "Manage"}
                </button>
                <button
                  type="button"
                  className="button"
                  style={{
                    padding: "var(--space-1) var(--space-2)",
                    fontSize: "var(--type-caption)",
                    background: "var(--color-error)",
                    color: "white",
                    border: "none",
                  }}
                  onClick={() => setConfirmDelete(group)}
                >
                  Del
                </button>
              </label>
              {editingGroupId === group.id ? (
                <div
                  style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-2)" }}
                >
                  {members.length === 0 ? (
                    <small style={{ color: "var(--color-muted)" }}>
                      No contacts yet — add a phone below.
                    </small>
                  ) : (
                    members.map((member) => (
                      <div
                        key={member.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                          fontSize: "var(--type-small)",
                        }}
                      >
                        <span style={{ flex: 1 }}>{member.phone ?? member.id}</span>
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ padding: "var(--space-1) var(--space-2)" }}
                          onClick={() =>
                            void api
                              .removeContactGroupMember(scope, group.id, member.id)
                              .then((res) => {
                                if (res.kind === "ready")
                                  setMembers((cur) => cur.filter((m) => m.id !== member.id))
                              })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <input
                      aria-label="Phone to add"
                      placeholder="+628123456789"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      style={{
                        flex: 1,
                        minHeight: "var(--control-height)",
                        padding: "var(--space-2)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-control)",
                      }}
                    />
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={!newPhone.trim()}
                      onClick={() =>
                        void api
                          .addContactGroupMember(scope, group.id, newPhone.trim())
                          .then((res) => {
                            if (res.kind === "ready") {
                              setMembers((cur) => [...cur, res.data])
                              setNewPhone("")
                            }
                          })
                      }
                    >
                      Add
                    </button>
                  </div>
                  {availableContacts.length > 0 ? (
                    <div style={{ display: "grid", gap: "var(--space-1)" }}>
                      <small style={{ color: "var(--color-muted)" }}>
                        Or pick from your WhatsApp contacts:
                      </small>
                      <select
                        aria-label="Pick from WhatsApp contacts"
                        defaultValue=""
                        onChange={(e) => {
                          const phone = e.target.value
                          if (phone) {
                            void api.addContactGroupMember(scope, group.id, phone).then((res) => {
                              if (res.kind === "ready") setMembers((cur) => [...cur, res.data])
                            })
                            e.target.value = ""
                          }
                        }}
                        style={{
                          minHeight: "var(--control-height)",
                          padding: "var(--space-2)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-control)",
                        }}
                      >
                        <option value="">Select a WhatsApp contact…</option>
                        {availableContacts.slice(0, 30).map((contact) => (
                          <option key={contact.phone} value={contact.phone}>
                            {contact.name ? `${contact.name} (${contact.phone})` : contact.phone}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <small style={{ color: "var(--color-muted)" }}>
                    Use E.164 format. This is your custom group — reuse it across campaigns. WAHA
                    group is separate.
                  </small>
                </div>
              ) : null}
            </div>
          ))
        )}
      </fieldset>
      {targetMode !== "custom" ? (
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
      ) : (
        <div
          style={{
            padding: "var(--space-3)",
            background: "var(--color-inset)",
            borderRadius: "var(--radius-control)",
            fontSize: "var(--type-small)",
            color: "var(--color-muted)",
          }}
        >
          Custom group selected — no WAHA group needed. The campaign will use your contact group
          directly.
        </div>
      )}
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
      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Delete ${confirmDelete.name}`}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgb(15 20 18 / 0.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: "var(--space-4)",
          }}
          onClick={() => setConfirmDelete(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirmDelete(null)
          }}
          tabIndex={-1}
        >
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no keyboard action needed */}
          <div
            role="document"
            style={{
              background: "var(--color-surface)",
              padding: "var(--space-6)",
              borderRadius: "var(--radius-panel)",
              maxWidth: "28rem",
              width: "100%",
              display: "grid",
              gap: "var(--space-3)",
              border: "1px solid var(--color-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <strong>Delete contact group “{confirmDelete.name}”?</strong>
            <small style={{ color: "var(--color-muted)" }}>
              This will remove the group and its members. Campaigns using this group will keep their
              reference but the group will no longer be selectable. This cannot be undone.
            </small>
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                style={{ background: "var(--color-error)", color: "white", border: "none" }}
                onClick={() =>
                  void api.deleteContactGroup(scope, confirmDelete.id).then((res) => {
                    if (res.kind === "ready") {
                      setContactGroups((cur) => cur.filter((g) => g.id !== confirmDelete.id))
                      onContactGroups(contactGroupIds.filter((id) => id !== confirmDelete.id))
                      if (editingGroupId === confirmDelete.id) setEditingGroupId(null)
                      setConfirmDelete(null)
                    } else {
                      setDeleteError(
                        res.message ||
                          "The server denied this scoped request — group may be in use by a campaign.",
                      )
                      setConfirmDelete(null)
                    }
                  })
                }
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteError ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete error"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgb(15 20 18 / 0.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: "var(--space-4)",
          }}
          onClick={() => setDeleteError(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDeleteError(null)
          }}
          tabIndex={-1}
        >
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no keyboard action needed */}
          <div
            role="document"
            style={{
              background: "var(--color-surface)",
              padding: "var(--space-6)",
              borderRadius: "var(--radius-panel)",
              maxWidth: "28rem",
              width: "100%",
              display: "grid",
              gap: "var(--space-3)",
              border: "1px solid var(--color-error)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <strong style={{ color: "var(--color-error)" }}>Could not delete</strong>
            <span>{deleteError}</span>
            <small style={{ color: "var(--color-muted)" }}>
              If the group is used by a campaign, delete the campaign first or remove the group from
              the campaign.
            </small>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDeleteError(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
