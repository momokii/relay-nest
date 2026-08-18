import type * as React from "react"

import type { AdminCreateUserInput, AdminGrantInput, AdminUser } from "../dashboard-admin-api"
import type {
  AnalyticsView,
  ContactView,
  NotificationSettings,
  Principal,
  RetentionPolicy,
  RetentionPreview,
  ScheduleInput,
  SendInput,
  SendResult,
  SessionView,
} from "../dashboard-api"
import type { AccountScope, DashboardRole, DashboardViewId } from "../dashboard-model"
import type { SessionLifecycleAction, SessionStatusHistory } from "../dashboard-session-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import type { DashboardOperationsController } from "../operations-controller"
import type { DashboardScheduleController } from "../schedule-controller"
import { pageDefinition, renderDashboardPage } from "./dashboard-view-router"

export type DashboardViewProps = Readonly<
  DashboardScheduleController &
    DashboardOperationsController & {
      activeView: DashboardViewId
      scope: AccountScope
      role: DashboardRole
      principal: Principal
      isDemo: boolean
      sessions: ResourceState<readonly SessionView[]>
      analytics: ResourceState<AnalyticsView>
      notifications: ResourceState<NotificationSettings>
      retention: ResourceState<readonly RetentionPolicy[]>
      sendAction: ActionState<SendResult>
      scheduleAction: ActionState<SendResult>
      contactAction: ActionState<ContactView>
      purgePreview: ActionState<RetentionPreview>
      purgeAction: ActionState<{ readonly deletedCount: number }>
      clearPurgePreview: () => void
      createUserAction: ActionState<AdminUser>
      grantAction: ActionState<null>
      disableAction: ActionState<null>
      sessionLifecycleAction: ActionState<SessionView | null>
      sessionHistoryAction: ActionState<readonly SessionStatusHistory[]>
      onSend: (input: SendInput) => Promise<void>
      onSchedule: (input: ScheduleInput) => Promise<void>
      onResolveContact: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
      onPreviewPurge: (scope: AccountScope, category: string) => Promise<void>
      onPurge: (
        scope: AccountScope,
        input: Readonly<{
          category: string
          cutoff: string
          previewCount: number
          previewToken: string
        }>,
      ) => Promise<void>
      onCreateUser: (input: AdminCreateUserInput) => Promise<void>
      onCreateGrant: (input: AdminGrantInput) => Promise<void>
      onDisableUser: (userId: string) => Promise<void>
      onLifecycle: (
        scope: AccountScope,
        sessionId: string,
        action: SessionLifecycleAction,
        confirmed: boolean,
      ) => Promise<void>
      onLoadHistory: (scope: AccountScope, sessionId: string) => Promise<void>
    }
>

export function DashboardView({
  activeView,
  scope,
  role,
  principal,
  isDemo,
  ...context
}: DashboardViewProps): React.JSX.Element {
  const page = pageDefinition(activeView)
  return (
    <>
      <header className="page-header">
        <div>
          <p className="overline">
            {page.eyebrow} · {scope}
          </p>
          <h1>{page.title}</h1>
          <p className="page-description">{page.description}</p>
        </div>
        <div className="page-identity">
          <span>{principal.user.email}</span>
          <strong>{role} access</strong>
        </div>
      </header>
      {isDemo ? (
        <output className="demo-banner">
          <strong>Demo data boundary</strong>
          <span>
            Live API evidence is unavailable for at least one surface. Nothing here claims a
            production send, delivery, or aggregate.
          </span>
        </output>
      ) : null}
      {renderDashboardPage(activeView, { scope, role, ...context })}
    </>
  )
}
