export const ACCOUNT_SCOPES = ["personal", "business"] as const
export type AccountScope = (typeof ACCOUNT_SCOPES)[number]

export const ROLES = ["admin", "operator", "viewer"] as const
export type DashboardRole = (typeof ROLES)[number]

export const CAPABILITIES = ["read", "operate", "admin"] as const
export type DashboardCapability = (typeof CAPABILITIES)[number]

export const VIEW_DEFINITIONS = [
  { id: "overview", label: "Overview", eyebrow: "Command center" },
  { id: "sessions", label: "Sessions", eyebrow: "Transport" },
  { id: "contacts", label: "Contacts", eyebrow: "Recipients" },
  { id: "send", label: "Send", eyebrow: "Individual text" },
  { id: "schedule", label: "Schedule", eyebrow: "One-time jobs" },
  { id: "analytics", label: "Analytics", eyebrow: "Scoped evidence" },
  { id: "notifications", label: "Notifications", eyebrow: "Failure paths" },
  { id: "retention", label: "Retention", eyebrow: "Admin controls" },
  { id: "users", label: "Users", eyebrow: "Access grants" },
  { id: "settings", label: "Settings", eyebrow: "Workspace policy" },
] as const
export type DashboardViewId = (typeof VIEW_DEFINITIONS)[number]["id"]

const CAPABILITIES_BY_ROLE = {
  admin: ["read", "operate", "admin"],
  operator: ["read", "operate"],
  viewer: ["read"],
} as const satisfies Record<DashboardRole, readonly DashboardCapability[]>

type QueryValue = string | number | boolean | undefined

export function buildScopedPath(
  path: string,
  scope: AccountScope,
  params: Readonly<Record<string, QueryValue>> = {},
): string {
  const query = new URLSearchParams({ scope })
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
  return `${path}?${query.toString()}`
}

export function canPerform(role: DashboardRole, capability: DashboardCapability): boolean {
  return CAPABILITIES_BY_ROLE[role].some((available) => available === capability)
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected dashboard variant: ${String(value)}`)
}

export type AiSuggestionStatus = "proposed" | "approved" | "rejected"
export type AiSendState = "not_sent"

export type AiSuggestion = {
  readonly id: string
  readonly kind: "summary" | "classification" | "draft"
  readonly text: string
  readonly provenance: string
  readonly status: AiSuggestionStatus
  readonly sendState: AiSendState
  readonly canSendSeparately: boolean
  readonly approve: () => AiSuggestion
  readonly reject: () => AiSuggestion
}

type AiSuggestionInput = Readonly<{
  id: string
  kind: AiSuggestion["kind"]
  text: string
  provenance: string
}>

function createSuggestion(input: AiSuggestionInput, status: AiSuggestionStatus): AiSuggestion {
  return {
    ...input,
    status,
    sendState: "not_sent",
    canSendSeparately: status === "approved" && input.kind === "draft",
    approve: () => createSuggestion(input, "approved"),
    reject: () => createSuggestion(input, "rejected"),
  }
}

export function createAiApproval(input: AiSuggestionInput): AiSuggestion {
  return createSuggestion(input, "proposed")
}

type MessageInput = Readonly<{
  recipient: string
  message: string
  hasConsent: boolean
  hasMedia: boolean
  isRecurring: boolean
}>

export type MessageValidation =
  | { readonly valid: true; readonly recipient: string; readonly message: string }
  | { readonly valid: false; readonly reason: string }

export function validateMessageInput(input: MessageInput): MessageValidation {
  if (input.hasMedia || input.isRecurring) {
    return {
      valid: false,
      reason: "Text messages are individual, one-time sends; media and recurrence are unavailable.",
    }
  }
  if (!input.hasConsent) {
    return { valid: false, reason: "Recipient consent is required before a send." }
  }

  const recipient = input.recipient.replace(/\s/g, "")
  const message = input.message.trim()
  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
    return { valid: false, reason: "Use a phone number with country code, such as +15551234567." }
  }
  if (message.length === 0 || message.length > 4096) {
    return { valid: false, reason: "Enter a text message between 1 and 4096 characters." }
  }
  return { valid: true, recipient, message }
}
