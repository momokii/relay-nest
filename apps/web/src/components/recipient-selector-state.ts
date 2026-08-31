import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ContactView } from "../dashboard-api"
import { canPerform } from "../dashboard-model"
import type { SessionChat } from "../dashboard-session-api"
import type { ActionState } from "../dashboard-state"
import {
  type ConsentActionResult,
  type ContactConsentRequest,
  type ContactResolutionRequest,
  isContactConsentMutationCurrent,
  isContactLookupActionCurrent,
  isContactLookupResultCurrent,
  normalizedRecipient,
  type RecipientSelectorController,
  type RecipientSelectorOptions,
} from "./recipient-selector-contract"

export type {
  ConsentActionResult,
  ContactConsentRequest,
  ContactResolutionRequest,
  RecipientSelection,
  RecipientSelectorController,
  RecipientSelectorOptions,
} from "./recipient-selector-contract"
export {
  canSubmitSelectedDirectoryContact,
  isContactConsentCurrent,
  isContactConsentMutationCurrent,
  isContactLookupResultCurrent,
  isContactResolutionCurrent,
  normalizedRecipient,
} from "./recipient-selector-contract"

function asyncErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The contact operation could not be completed."
}

export function useRecipientSelector(
  options: RecipientSelectorOptions,
): RecipientSelectorController {
  const [recipient, setRecipient] = useState("")
  const [selectedSession, setSelectedSession] = useState("")
  const [selectedDirectoryPhone, setSelectedDirectoryPhone] = useState<string | undefined>()
  const [resolutionRequest, setResolutionRequest] = useState<ContactResolutionRequest | undefined>()
  const [consentContactId, setConsentContactId] = useState<string | undefined>()
  const [consentRequest, setConsentRequest] = useState<ContactConsentRequest | undefined>()
  const [callbackError, setCallbackError] = useState<
    { readonly phase: "resolution" | "consent"; readonly message: string } | undefined
  >()
  const resolutionGenerationRef = useRef(0)
  const resolutionActionRef = useRef<ActionState<ContactView> | undefined>(undefined)
  const consentRequestTokenRef = useRef(0)
  const consentRequestActionRef = useRef<ActionState<ConsentActionResult> | undefined>(undefined)
  const sessionOptions = useMemo(
    () =>
      options.sessions.kind === "ready"
        ? options.sessions.data.filter((session) => session.accountScope === options.scope)
        : [],
    [options.scope, options.sessions],
  )
  const sessionId = sessionOptions.some((session) => session.id === selectedSession)
    ? selectedSession
    : (sessionOptions[0]?.id ?? "")
  const context = `${options.scope}:${sessionId}`
  const previousContextRef = useRef(context)
  const canOperate = canPerform(options.role, "operate")
  const lookupActionCurrent = isContactLookupActionCurrent({
    action: options.action,
    request: resolutionRequest,
    requestAction: resolutionActionRef.current,
    currentGeneration: resolutionGenerationRef.current,
    currentRecipient: recipient,
    activeSession: sessionId,
  })
  const resolvedContact =
    options.action.kind === "ready" &&
    isContactLookupResultCurrent({
      action: options.action,
      request: resolutionRequest,
      requestAction: resolutionActionRef.current,
      currentGeneration: resolutionGenerationRef.current,
      currentRecipient: recipient,
      activeSession: sessionId,
    })
      ? options.action.data
      : undefined
  const consentMutationCurrent = isContactConsentMutationCurrent({
    resolvedContactId: resolvedContact?.id,
    consentContactId,
    consentRequest,
    currentConsentRequestToken: consentRequestTokenRef.current,
    consentRequestAction: consentRequestActionRef.current,
    consentAction: options.consentAction,
  })
  const consentPending =
    resolvedContact !== undefined &&
    consentContactId === resolvedContact.id &&
    consentRequest?.token === consentRequestTokenRef.current &&
    (!consentMutationCurrent || options.consentAction.kind === "submitting")
  const consentResponseAccepted =
    consentMutationCurrent &&
    options.consentAction.kind === "ready" &&
    options.consentAction.data.updated
  const hasServerConsent = resolvedContact
    ? consentPending
      ? false
      : consentResponseAccepted
        ? consentRequest?.consentGranted === true
        : resolvedContact.consentGranted && !resolvedContact.optedOut
    : false
  const consentDenied =
    (consentMutationCurrent &&
      ((options.consentAction.kind === "ready" && !options.consentAction.data.updated) ||
        options.consentAction.kind === "denied" ||
        options.consentAction.kind === "error" ||
        options.consentAction.kind === "unavailable")) ||
    callbackError?.phase === "consent"
  const clearSelection = useCallback((): void => {
    resolutionGenerationRef.current += 1
    consentRequestTokenRef.current += 1
    setSelectedDirectoryPhone(undefined)
    setResolutionRequest(undefined)
    setConsentContactId(undefined)
    setConsentRequest(undefined)
    setCallbackError(undefined)
    resolutionActionRef.current = undefined
    consentRequestActionRef.current = undefined
  }, [])
  const beginResolution = useCallback(
    (value: string, directoryPhone: string | undefined): void => {
      const target = normalizedRecipient(value)
      if (!sessionId || !target) return
      clearSelection()
      const generation = resolutionGenerationRef.current
      setRecipient(target)
      setSelectedDirectoryPhone(directoryPhone)
      const request = { generation, recipient: target, sessionId }
      setResolutionRequest(request)
      resolutionActionRef.current = options.action
      void options.onResolve(options.scope, sessionId, target).catch((error: unknown) => {
        if (resolutionGenerationRef.current !== generation) return
        setCallbackError({ phase: "resolution", message: asyncErrorMessage(error) })
      })
    },
    [clearSelection, options, sessionId],
  )

  useEffect(() => {
    if (previousContextRef.current === context) return
    previousContextRef.current = context
    setRecipient("")
    clearSelection()
  }, [clearSelection, context])

  const onSessionChange = useCallback(
    (nextSession: string): void => {
      setSelectedSession(nextSession)
      setRecipient("")
      clearSelection()
    },
    [clearSelection],
  )
  const onRecipientChange = useCallback(
    (nextRecipient: string): void => {
      setRecipient(nextRecipient)
      clearSelection()
    },
    [clearSelection],
  )
  const onResolve = useCallback(
    (): void => beginResolution(recipient, undefined),
    [beginResolution, recipient],
  )
  const onDirectorySelect = useCallback(
    (chat: SessionChat): void => {
      const target = chat.isGroup || chat.phone === null ? undefined : chat.phone
      if (target !== undefined) beginResolution(target, target)
    },
    [beginResolution],
  )
  const onConsentChange = useCallback(
    (consentGranted: boolean): void => {
      if (!resolvedContact || !sessionId) return
      consentRequestTokenRef.current += 1
      const request = {
        token: consentRequestTokenRef.current,
        contactId: resolvedContact.id,
        consentGranted,
      }
      setConsentContactId(resolvedContact.id)
      setConsentRequest(request)
      setCallbackError(undefined)
      consentRequestActionRef.current = options.consentAction
      void options
        .onSetConsent(options.scope, sessionId, resolvedContact.id, {
          consentGranted,
          optedOut: !consentGranted,
        })
        .catch((error: unknown) => {
          if (consentRequestTokenRef.current !== request.token) return
          setCallbackError({ phase: "consent", message: asyncErrorMessage(error) })
        })
    },
    [options, resolvedContact, sessionId],
  )
  return {
    scope: options.scope,
    canOperate,
    sessions: options.sessions,
    sessionId,
    sessionOptions,
    selection: {
      recipient,
      contactId: resolvedContact?.id,
      resolvedContact,
      selectedDirectoryPhone,
      hasServerConsent,
      consentCheckboxChecked: consentPending
        ? consentRequest?.consentGranted === true
        : hasServerConsent,
      consentPending,
      consentDenied,
      resolutionPending: resolutionRequest !== undefined && !resolvedContact && !callbackError,
      resolutionFailed:
        (lookupActionCurrent &&
          (options.action.kind === "denied" ||
            options.action.kind === "error" ||
            options.action.kind === "unavailable")) ||
        callbackError?.phase === "resolution",
    },
    onSessionChange,
    onRecipientChange,
    onResolve,
    onDirectorySelect,
    onConsentChange,
  }
}

export function recipientSelectorError(
  controller: RecipientSelectorController,
): string | undefined {
  if (controller.selection.resolutionFailed) return "The recipient could not be verified."
  if (controller.selection.consentDenied) return "The server did not record this consent change."
  return undefined
}
