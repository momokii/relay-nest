import type * as React from "react"
import { useState } from "react"

import type { AccountScope } from "../dashboard-model"
import { RETENTION_CATEGORIES, type RetentionPolicyInput } from "../dashboard-retention-api"
import type { ActionState } from "../dashboard-state"
import { StateNotice } from "./ui"

export function RetentionPolicyForm({
  scope,
  action,
  onSave,
}: Readonly<{
  scope: AccountScope
  action: ActionState<unknown>
  onSave: (scope: AccountScope, input: RetentionPolicyInput) => Promise<void>
}>): React.JSX.Element {
  const [category, setCategory] = useState<RetentionPolicyInput["category"]>("messages")
  const [retentionDays, setRetentionDays] = useState("30")
  return (
    <form
      className="operational-form"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave(scope, { category, retentionDays: Number(retentionDays) })
      }}
    >
      <h3>Update policy</h3>
      <label>
        <span>Category</span>
        <select
          value={category}
          onChange={(event) => {
            const next = RETENTION_CATEGORIES.find((candidate) => candidate === event.target.value)
            if (next) setCategory(next)
          }}
        >
          {RETENTION_CATEGORIES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Retention days</span>
        <input
          type="number"
          min="1"
          max="3650"
          value={retentionDays}
          onChange={(event) => setRetentionDays(event.target.value)}
          required
        />
      </label>
      <button
        className="button button-secondary"
        type="submit"
        disabled={action.kind === "submitting"}
      >
        {action.kind === "submitting" ? "Saving…" : "Save retention policy"}
      </button>
      {action.kind === "ready" ? (
        <StateNotice title="Policy saved" message="The selected scope policy was updated." />
      ) : null}
      {action.kind === "denied" || action.kind === "error" || action.kind === "unavailable" ? (
        <StateNotice title="Policy update unavailable" message={action.message} tone="error" />
      ) : null}
    </form>
  )
}
