import type { ContactView, SessionView } from "../dashboard-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import type { SessionChat } from "../dashboard-session-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { directoryContactTarget } from "./chat-directory"

export type ContactResolutionRequest = Readonly<{
  generation: number
  recipient: string
  sessionId: string
}>

export type ContactConsentRequest = Readonly<{
  token: number
  contactId: string
  consentGranted: boolean
}>

export type ConsentActionResult = { readonly updated: boolean }

export function normalizedRecipient(value: string): string {
  return value.trim().replace(/[\s().-]/g, "")
}

export function isContactResolutionCurrent(
  input: Readonly<{
    currentGeneration: number
    currentRecipient: string
    currentSessionId: string
    request: ContactResolutionRequest
  }>,
): boolean {
  return (
    input.request.generation === input.currentGeneration &&
    input.request.recipient === normalizedRecipient(input.currentRecipient) &&
    input.request.sessionId === input.currentSessionId
  )
}

export function isContactLookupActionCurrent(
  input: Readonly<{
    action: ActionState<ContactView>
    request: ContactResolutionRequest | undefined
    requestAction: ActionState<ContactView> | undefined
    currentGeneration: number
    currentRecipient: string
    activeSession: string
  }>,
): boolean {
  return (
    input.action !== input.requestAction &&
    input.request !== undefined &&
    isContactResolutionCurrent({
      currentGeneration: input.currentGeneration,
      currentRecipient: input.currentRecipient,
      currentSessionId: input.activeSession,
      request: input.request,
    })
  )
}

export function isContactLookupResultCurrent(
  input: Readonly<{
    action: ActionState<ContactView>
    request: ContactResolutionRequest | undefined
    requestAction: ActionState<ContactView> | undefined
    currentGeneration: number
    currentRecipient: string
    activeSession: string
  }>,
): boolean {
  return (
    input.action.kind === "ready" &&
    isContactLookupActionCurrent(input) &&
    input.action.data.phone === normalizedRecipient(input.currentRecipient)
  )
}

export function isContactConsentMutationCurrent(
  input: Readonly<{
    resolvedContactId: string | undefined
    consentContactId: string | undefined
    consentRequest: ContactConsentRequest | undefined
    currentConsentRequestToken: number
    consentRequestAction: ActionState<ConsentActionResult> | undefined
    consentAction: ActionState<ConsentActionResult>
  }>,
): boolean {
  return (
    input.resolvedContactId !== undefined &&
    input.resolvedContactId === input.consentContactId &&
    input.consentRequest !== undefined &&
    input.consentRequest.token === input.currentConsentRequestToken &&
    input.consentRequest.contactId === input.resolvedContactId &&
    input.consentAction !== input.consentRequestAction
  )
}

export function isContactConsentCurrent(
  input: Readonly<{
    resolvedContactId: string | undefined
    consentContactId: string | undefined
    consentRequestToken: number
    currentConsentRequestToken: number
    requestedConsentGranted: boolean
    consentRequestAction: ActionState<ConsentActionResult> | undefined
    consentAction: ActionState<ConsentActionResult>
  }>,
): boolean {
  return (
    input.requestedConsentGranted &&
    isContactConsentMutationCurrent({
      resolvedContactId: input.resolvedContactId,
      consentContactId: input.consentContactId,
      consentRequest: {
        token: input.consentRequestToken,
        contactId: input.consentContactId ?? "",
        consentGranted: input.requestedConsentGranted,
      },
      currentConsentRequestToken: input.currentConsentRequestToken,
      consentRequestAction: input.consentRequestAction,
      consentAction: input.consentAction,
    }) &&
    input.consentAction.kind === "ready" &&
    input.consentAction.data.updated
  )
}

export function canSubmitSelectedDirectoryContact(
  input: Readonly<{ selectedChatId: string | undefined; contactId: string | undefined }>,
): boolean {
  return input.selectedChatId === undefined || input.contactId !== undefined
}

export type RecipientSelection = Readonly<{
  recipient: string
  contactId: string | undefined
  resolvedContact: ContactView | undefined
  selectedDirectoryPhone: string | undefined
  hasServerConsent: boolean
  consentCheckboxChecked: boolean
  consentPending: boolean
  consentDenied: boolean
  resolutionPending: boolean
  resolutionFailed: boolean
}>

export type RecipientSelectorController = Readonly<{
  scope: AccountScope
  canOperate: boolean
  sessions: ResourceState<readonly SessionView[]>
  sessionId: string
  sessionOptions: readonly SessionView[]
  selection: RecipientSelection
  onSessionChange: (sessionId: string) => void
  onRecipientChange: (recipient: string) => void
  onResolve: () => void
  onDirectorySelect: (chat: SessionChat) => void
  onConsentChange: (consentGranted: boolean) => void
}>

export type RecipientSelectorOptions = Readonly<{
  scope: AccountScope
  role: DashboardRole
  sessions: ResourceState<readonly SessionView[]>
  action: ActionState<ContactView>
  consentAction: ActionState<ConsentActionResult>
  onResolve: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
  onSetConsent: (
    scope: AccountScope,
    sessionId: string,
    contactId: string,
    input: { readonly consentGranted: boolean; readonly optedOut: boolean },
  ) => Promise<void>
}>

export { directoryContactTarget }
