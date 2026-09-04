import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { type Campaign, createCampaignApi } from "../campaign-api"
import type { SessionView } from "../dashboard-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import type { ResourceState } from "../dashboard-state"
import { CampaignForm } from "./campaign-form"
import { CampaignList } from "./campaign-list"
import { StateNotice } from "./ui"

export function CampaignPage({
  scope,
  role,
  sessions,
}: Readonly<{
  scope: AccountScope
  role: DashboardRole
  sessions: ResourceState<readonly SessionView[]>
}>): React.JSX.Element {
  const api = useMemo(() => createCampaignApi(import.meta.env.VITE_API_BASE_URL), [])
  const [campaigns, setCampaigns] = useState<readonly Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const result = await api.list(scope)
    setCampaigns(result.kind === "ready" ? result.data : [])
    setLoading(false)
  }, [api, scope])
  useEffect(() => {
    void load()
  }, [load])
  const sessionList = sessions.kind === "ready" ? sessions.data : []
  return (
    <div className="page-grid campaign-page">
      {sessions.kind === "denied" ? (
        <StateNotice
          title="Campaigns unavailable"
          message="No authorized session grant exists in this scope."
          tone="warning"
        />
      ) : (
        <>
          <CampaignForm
            scope={scope}
            role={role}
            sessions={sessionList}
            api={api}
            onCreated={() => void load()}
          />
          {loading ? (
            <StateNotice
              title="Loading campaign history"
              message="Reading only campaigns authorized for this scope."
            />
          ) : (
            <CampaignList
              campaigns={campaigns}
              onCancel={(id) => {
                void api.cancel(scope, id).then(() => void load())
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
