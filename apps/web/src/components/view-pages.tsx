import type * as React from "react"
import { useState } from "react"

import type {
  ContactView,
  ScheduleInput,
  SendInput,
  SendResult,
  SessionView,
} from "../dashboard-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import type { ActionState, ResourceState } from "../dashboard-state"
import type { DashboardScheduleHistoryController } from "../schedule-history-controller"
import { ScheduleHistoryPanel } from "./schedule-history-panel"
import { ContactLookup, MessageComposer } from "./send-forms"

export { RetentionPage, SettingsPage } from "./admin-pages"
export { CampaignPage } from "./campaign-page"
export { NotificationsPage } from "./notification-page"
export { AnalyticsPage, OverviewPage } from "./overview-pages"
export { SessionsPage } from "./session-page"
export { UsersPage } from "./user-access-page"

export function ContactsPage({
  scope,
  role,
  sessions,
  action,
  consentAction,
  onResolve,
  onSetConsent,
}: Readonly<{
  scope: AccountScope
  role: DashboardRole
  sessions: ResourceState<readonly SessionView[]>
  action: ActionState<ContactView>
  consentAction: ActionState<{ readonly updated: boolean }>
  onResolve: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
  onSetConsent: (
    scope: AccountScope,
    sessionId: string,
    contactId: string,
    input: { readonly consentGranted: boolean; optedOut: boolean },
  ) => Promise<void>
}>): React.JSX.Element {
  return (
    <div className="page-grid contacts-page">
      <ContactLookup
        scope={scope}
        role={role}
        sessions={sessions}
        action={action}
        consentAction={consentAction}
        onResolve={onResolve}
        onSetConsent={onSetConsent}
      />
    </div>
  )
}

type ScheduleHistoryProps = Pick<
  DashboardScheduleHistoryController,
  | "history"
  | "page"
  | "pageSize"
  | "q"
  | "stateFilter"
  | "from"
  | "to"
  | "detail"
  | "editAction"
  | "cancelAction"
  | "deleteAction"
  | "loadPage"
  | "setPageSize"
  | "setQ"
  | "setStateFilter"
  | "setFrom"
  | "setTo"
  | "selectJob"
  | "editJob"
  | "cancelJob"
  | "deleteJob"
>

function ScheduleHistorySection({
  scope,
  history,
  page,
  pageSize,
  q,
  stateFilter,
  from,
  to,
  detail,
  editAction,
  cancelAction,
  deleteAction,
  loadPage,
  setPageSize,
  setQ,
  setStateFilter,
  setFrom,
  setTo,
  selectJob,
  editJob,
  cancelJob,
  deleteJob,
}: ScheduleHistoryProps & Readonly<{ scope: AccountScope }>): React.JSX.Element {
  const [openJobId, setOpenJobId] = useState("")
  return (
    <ScheduleHistoryPanel
      key={scope}
      scope={scope}
      history={history}
      page={page}
      pageSize={pageSize}
      q={q}
      stateFilter={stateFilter}
      from={from}
      to={to}
      openJobId={openJobId}
      detail={detail}
      editAction={editAction}
      cancelAction={cancelAction}
      deleteAction={deleteAction}
      loadPage={(nextPage) => {
        setOpenJobId("")
        loadPage(nextPage)
      }}
      setPageSize={setPageSize}
      setQ={setQ}
      setStateFilter={setStateFilter}
      setFrom={setFrom}
      setTo={setTo}
      onOpenJob={(jobId) => {
        setOpenJobId(jobId)
        selectJob(jobId)
      }}
      onCloseJob={() => setOpenJobId("")}
      onEdit={editJob}
      onCancel={cancelJob}
      onDelete={deleteJob}
    />
  )
}

export function SendPage(
  props: Readonly<
    {
      scope: AccountScope
      role: DashboardRole
      sessions: ResourceState<readonly SessionView[]>
      action: ActionState<SendResult>
      contactAction: ActionState<ContactView>
      consentAction: ActionState<{ readonly updated: boolean }>
      onResolve: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
      onSetConsent: (
        scope: AccountScope,
        sessionId: string,
        contactId: string,
        input: { readonly consentGranted: boolean; readonly optedOut: boolean },
      ) => Promise<void>
      onSend: (input: SendInput) => Promise<void>
      onSchedule: (input: ScheduleInput) => Promise<void>
    } & ScheduleHistoryProps
  >,
): React.JSX.Element {
  return (
    <div className="page-grid send-page">
      <MessageComposer key={props.scope} mode="send" {...props} />
      <ScheduleHistorySection {...props} />
    </div>
  )
}

export function SchedulePage(
  props: Readonly<
    {
      scope: AccountScope
      role: DashboardRole
      sessions: ResourceState<readonly SessionView[]>
      action: ActionState<SendResult>
      contactAction: ActionState<ContactView>
      consentAction: ActionState<{ readonly updated: boolean }>
      onResolve: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
      onSetConsent: (
        scope: AccountScope,
        sessionId: string,
        contactId: string,
        input: { readonly consentGranted: boolean; readonly optedOut: boolean },
      ) => Promise<void>
      onSend: (input: SendInput) => Promise<void>
      onSchedule: (input: ScheduleInput) => Promise<void>
    } & ScheduleHistoryProps
  >,
): React.JSX.Element {
  return (
    <div className="page-grid schedule-page">
      <ScheduleHistorySection {...props} />
      <MessageComposer key={props.scope} mode="schedule" {...props} />
    </div>
  )
}
