import type * as React from "react"

import type {
  ContactView,
  ScheduleInput,
  SendInput,
  SendResult,
  SessionView,
} from "../dashboard-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import type { ScheduleEditInput, ScheduleView } from "../dashboard-schedule-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { ScheduleJobsPanel } from "./schedule-jobs-panel"
import { ContactLookup, MessageComposer } from "./send-forms"
import { SentHistoryPanel } from "./sent-history-panel"

export { RetentionPage, SettingsPage } from "./admin-pages"
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

export function SendPage(
  props: Readonly<{
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
  }>,
): React.JSX.Element {
  return (
    <div className="page-grid send-page">
      <MessageComposer key={props.scope} mode="send" {...props} />
      <SentHistoryPanel key={`${props.scope}-${props.action.kind}`} scope={props.scope} />
    </div>
  )
}

export function SchedulePage(
  props: Readonly<{
    scope: AccountScope
    role: DashboardRole
    sessions: ResourceState<readonly SessionView[]>
    selectedSessionId: string
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
    schedules: ResourceState<readonly ScheduleView[]>
    selectedScheduleId: string
    detail: ResourceState<ScheduleView | undefined>
    editAction: ActionState<ScheduleView>
    cancelAction: ActionState<ScheduleView>
    selectSession: (sessionId: string) => void
    selectSchedule: (jobId: string) => void
    editSchedule: (
      scope: AccountScope,
      sessionId: string,
      jobId: string,
      input: ScheduleEditInput,
    ) => Promise<void>
    cancelSchedule: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
  }>,
): React.JSX.Element {
  return (
    <div className="page-grid schedule-page">
      <MessageComposer key={props.scope} mode="schedule" {...props} />
      <ScheduleJobsPanel {...props} />
      <SentHistoryPanel key={`${props.scope}-${props.action.kind}`} scope={props.scope} />
    </div>
  )
}
