import type {
  AnalyticsView,
  NotificationSettings,
  Principal,
  RetentionPolicy,
  SessionView,
} from "./dashboard-api"

export const DEMO_NOTICE =
  "Demo shell only: the live API did not provide this scope. No operational metric is asserted as production truth."

export const DEMO_PRINCIPAL: Principal = {
  user: {
    id: "demo-user",
    email: "operator@example.invalid",
    displayName: "Alex Morgan",
    rolesByScope: { personal: ["admin", "operator"], business: ["operator"] },
  },
}

export const DEMO_SESSIONS: readonly SessionView[] = [
  {
    id: "demo-personal-session",
    accountScope: "personal",
    name: "Personal workspace",
    status: "unknown",
    serviceHealth: "unknown",
    sendingReadiness: "unknown",
  },
  {
    id: "demo-business-session",
    accountScope: "business",
    name: "Business workspace",
    status: "unknown",
    serviceHealth: "unknown",
    sendingReadiness: "unknown",
  },
]

export const DEMO_ANALYTICS: AnalyticsView = {
  scope: "personal",
  window: { from: "Unknown", to: "Unknown" },
  messageVolume: { total: 0, inbound: 0, outbound: 0, unknownDirection: 0 },
  acknowledgments: { submitted: 0, acknowledged: 0, failed: 0, unknown: 0 },
  failureRate: null,
  uptimeMs: null,
  retryCount: 0,
  timelockIndicators: 0,
  cappingIndicators: 0,
  contactActivity: 0,
  scheduledJobs: {
    total: 0,
    scheduled: 0,
    queued: 0,
    attempting: 0,
    submitted: 0,
    acknowledged: 0,
    failed: 0,
    unknown: 0,
    cancelled: 0,
    retries: 0,
  },
  sessions: [],
}

export const DEMO_RETENTION: readonly RetentionPolicy[] = [
  { id: "demo-messages", accountScope: "personal", category: "messages", retentionDays: 0 },
  { id: "demo-contacts", accountScope: "personal", category: "contacts", retentionDays: 0 },
  { id: "demo-events", accountScope: "personal", category: "events", retentionDays: 0 },
]

export const DEMO_NOTIFICATIONS: NotificationSettings = {
  accountScope: "personal",
  email: { enabled: false, configured: false },
  telegram: { enabled: false, configured: false },
}
