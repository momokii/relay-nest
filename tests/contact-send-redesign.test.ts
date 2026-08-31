import { describe, expect, it } from "vitest"

import { createMessagingService } from "../apps/api/src/messaging"
import * as React from "../apps/web/node_modules/react"
import { renderToStaticMarkup } from "../apps/web/node_modules/react-dom/server"
import { directoryChatKey, directoryContactTarget } from "../apps/web/src/components/chat-directory"
import {
  ContactLookup,
  isContactConsentCurrent,
  isContactLookupResultCurrent,
} from "../apps/web/src/components/contact-lookup"
import {
  canSubmitSelectedDirectoryContact,
  isContactResolutionCurrent,
  MessageComposer,
} from "../apps/web/src/components/message-composer"
import { isContactConsentMutationCurrent } from "../apps/web/src/components/recipient-selector"
import type { SessionView } from "../apps/web/src/dashboard-api"
import { requestTokenIsCurrent } from "../apps/web/src/dashboard-controller"
import type { AccountScope } from "../apps/web/src/dashboard-model"
import { principal, serviceOptions } from "./messaging-fixtures"

function composerMarkup(
  scope: AccountScope,
  sessions: readonly SessionView[],
  mode: "send" | "schedule" = "send",
): string {
  return renderToStaticMarkup(
    React.createElement(MessageComposer, {
      mode,
      scope,
      role: "operator",
      sessions: { kind: "ready", data: sessions },
      action: { kind: "idle" },
      contactAction: { kind: "idle" },
      consentAction: { kind: "idle" },
      onResolve: async () => undefined,
      onSetConsent: async () => undefined,
      onSend: async () => undefined,
      onSchedule: async () => undefined,
    }),
  )
}

describe("contact send redesign selector contract baseline", () => {
  it("keeps redacted directory rows uniquely keyed", () => {
    // Given two directory rows whose provider identities are intentionally redacted
    const chats = [
      { phone: null, name: null, isGroup: false },
      { phone: null, name: null, isGroup: false },
    ] as const

    // When the UI derives React keys for the rows
    const keys = chats.map(directoryChatKey)

    // Then each row has a distinct stable key within the rendered list
    expect(new Set(keys).size).toBe(chats.length)
  })

  it("renders exactly one selectable recipient target", () => {
    // Given the Send surface with one authorized Personal session
    // When the composer renders its recipient region
    const markup = composerMarkup("personal", [
      {
        id: "session-1",
        accountScope: "personal",
        name: "Personal line",
        status: "WORKING",
        serviceHealth: "unknown",
        sendingReadiness: "unknown",
      },
    ])

    // Then exactly one manual entry field, one directory region, and one
    // consent attestation exist, with no multi-select affordance
    expect((markup.match(/inputmode="tel"/gi) ?? []).length).toBe(1)
    expect((markup.match(/WhatsApp chat directory/g) ?? []).length).toBe(1)
    expect((markup.match(/valid consent basis/g) ?? []).length).toBe(1)
    expect(markup).not.toContain("multiple")
  })

  it.each([
    ["Contacts", "contact-lookup"],
    ["Direct", "send"],
    ["Scheduled", "schedule"],
  ] as const)("uses the shared recipient selector on the %s surface", (surface, mode) => {
    const markup =
      mode === "contact-lookup"
        ? renderToStaticMarkup(
            React.createElement(ContactLookup, {
              scope: "personal",
              role: "operator",
              sessions: { kind: "ready", data: [] },
              action: { kind: "idle" },
              consentAction: { kind: "idle" },
              onResolve: async () => undefined,
              onSetConsent: async () => undefined,
            }),
          )
        : composerMarkup(
            "personal",
            [
              {
                id: "session-1",
                accountScope: "personal",
                name: "Personal line",
                status: "WORKING",
                serviceHealth: "unknown",
                sendingReadiness: "unknown",
              },
            ],
            mode,
          )

    // When the surface renders
    // Then the same server-consent selector contract is present
    expect(surface).toBeDefined()
    expect(markup).toContain("Server consent record")
  })

  it("makes the authorized contact list the obvious recipient path", () => {
    // Given the Send surface with one authorized Personal session
    const markup = composerMarkup("personal", [
      {
        id: "session-1",
        accountScope: "personal",
        name: "Personal line",
        status: "WORKING",
        serviceHealth: "unknown",
        sendingReadiness: "unknown",
      },
    ])

    // When the operator opens Direct Send
    // Then the contact list is described as the simple selection path
    expect(markup).toContain("Choose a contact")
    expect(markup).toContain("Search contact list")
    expect(markup).toContain("Selecting a contact only fills the recipient")
  })

  it("derives an E.164 recipient only from an eligible individual chat", () => {
    // Given one individual chat, one group, and one non-derivable identity
    const individual = { phone: "+628123456789", isGroup: false }
    const group = { phone: null, isGroup: true }
    const lid = { phone: null, isGroup: false }

    // When directory targets are derived
    // Then only the individual chat becomes a selectable E.164 value
    expect(directoryContactTarget(individual)).toBe("+628123456789")
    expect(directoryContactTarget(group)).toBeUndefined()
    expect(directoryContactTarget(lid)).toBeUndefined()
  })

  it("blocks a directory target until the server returns its contact id", () => {
    // Given a selected directory row whose contact resolution is still pending
    // When the composer evaluates whether submission is allowed
    // Then the unresolved directory target stays blocked
    expect(
      canSubmitSelectedDirectoryContact({
        selectedChatId: "628123456789@c.us",
        contactId: undefined,
      }),
    ).toBe(false)
    expect(
      canSubmitSelectedDirectoryContact({
        selectedChatId: "628123456789@c.us",
        contactId: "contact-1",
      }),
    ).toBe(true)
    expect(
      canSubmitSelectedDirectoryContact({ selectedChatId: undefined, contactId: undefined }),
    ).toBe(true)
  })

  it("keeps the authorized session selection inside the active scope", () => {
    // Given sessions from both scopes while the active scope is Personal
    // When the composer renders its session selector
    const markup = composerMarkup("personal", [
      {
        id: "session-1",
        accountScope: "personal",
        name: "Personal line",
        status: "WORKING",
        serviceHealth: "unknown",
        sendingReadiness: "unknown",
      },
      {
        id: "session-2",
        accountScope: "business",
        name: "Business line",
        status: "WORKING",
        serviceHealth: "unknown",
        sendingReadiness: "unknown",
      },
    ])

    // Then the cross-scope session is never offered as an authorized session
    expect(markup).toContain("Personal line")
    expect(markup).not.toContain("Business line")
  })

  it("accepts a pre-resolved contact id as an individual send target", async () => {
    // Given a verified, consented contact previously returned by resolution
    const scheduled: unknown[] = []
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          findById: async () => ({
            id: "contact-1",
            accountScope: "personal" as const,
            sessionId: "session-1",
            phone: "+628123456789",
            displayName: "Example",
            providerChatId: "628123456789@c.us",
            consentGranted: true,
            optedOut: false,
          }),
          save: async (contact: unknown) => contact,
        },
        scheduler: {
          schedule: async (input: unknown) => {
            scheduled.push(input)
            return { jobId: "job-1", duplicate: false }
          },
          dispatch: async () => ({ state: "submitted" as const, providerMessageId: "provider-1" }),
        },
        wahaForSession: async () => ({
          checkExists: async () => {
            throw new Error("must not check-exists a pre-resolved contact target")
          },
          contact: async () => {
            throw new Error("must not re-resolve a pre-resolved contact target")
          },
        }),
      }),
    )

    // When the operator sends through the pre-resolved contact id
    const result = await service.sendImmediate(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      contactId: "contact-1",
      message: "hello",
      idempotencyKey: "send-contact-1",
    })

    // Then the send routes through the saved verified contact without any raw chat id
    expect(result).toEqual({ state: "submitted", providerMessageId: "provider-1" })
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]).toMatchObject({ recipientPhone: "+628123456789" })
  })

  it("denies a pre-resolved contact id target without server consent", async () => {
    // Given a verified contact whose server consent record is not granted
    const schedule = async (): Promise<never> => {
      throw new Error("scheduler must not be called")
    }
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          findById: async () => ({
            id: "contact-1",
            accountScope: "personal" as const,
            sessionId: "session-1",
            phone: "+628123456789",
            displayName: "Example",
            providerChatId: "628123456789@c.us",
            consentGranted: false,
            optedOut: false,
          }),
          save: async (contact: unknown) => contact,
        },
        scheduler: { schedule },
      }),
    )

    // When the operator sends through the pre-resolved contact id
    const result = await service.sendImmediate(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      contactId: "contact-1",
      message: "hello",
      idempotencyKey: "send-contact-unconsented",
    })

    // Then the server denies the send before any scheduling occurs
    expect(result).toEqual({ state: "failed", recoveryCode: "consent_required" })
  })

  it("ignores a contact resolution after the recipient changes", () => {
    // Given a delayed resolution started for the original directory recipient
    const request = {
      generation: 1,
      recipient: "+628123456789",
      sessionId: "session-1",
    }

    // When the operator edits the recipient before the response arrives
    const stillCurrent = isContactResolutionCurrent({
      currentGeneration: 2,
      currentRecipient: "+15551234567",
      currentSessionId: "session-1",
      request,
    })

    // Then the stale response cannot restore the old contact id
    expect(stillCurrent).toBe(false)
  })

  it("accepts only the current contact resolution for the selected session", () => {
    // Given a resolution response for the current directory selection
    const request = {
      generation: 3,
      recipient: "+628123456789",
      sessionId: "session-1",
    }

    // When the response matches the current input and session
    const stillCurrent = isContactResolutionCurrent({
      currentGeneration: 3,
      currentRecipient: "+628123456789",
      currentSessionId: "session-1",
      request,
    })

    // Then the resolved contact may be attached to the submission
    expect(stillCurrent).toBe(true)
  })

  it("rejects a repeated lookup until a new action result arrives", () => {
    // Given a ready result from a previous lookup for the same contact
    const previousAction = {
      kind: "ready" as const,
      data: {
        id: "contact-1",
        phone: "+628123456789",
        displayName: "Example",
        consentGranted: false,
        optedOut: false,
      },
    }
    const request = { generation: 1, recipient: "+628123456789", sessionId: "session-1" }

    // When the same lookup starts again while the old action is still ready
    const current = isContactLookupResultCurrent({
      action: previousAction,
      request,
      requestAction: previousAction,
      currentGeneration: 1,
      currentRecipient: "+628123456789",
      activeSession: "session-1",
    })

    // Then the old contact cannot be treated as the new resolution
    expect(current).toBe(false)
  })

  it("rejects an older same-recipient lookup generation", () => {
    // Given the same recipient was resolved twice and the older response arrives last
    const action = {
      kind: "ready" as const,
      data: {
        id: "contact-old",
        phone: "+628123456789",
        displayName: "Older",
        consentGranted: false,
        optedOut: false,
      },
    }

    // When the response belongs to generation 1 but generation 2 is current
    const current = isContactLookupResultCurrent({
      action,
      request: { generation: 1, recipient: "+628123456789", sessionId: "session-1" },
      requestAction: { kind: "submitting" as const },
      currentGeneration: 2,
      currentRecipient: "+628123456789",
      activeSession: "session-1",
    })

    // Then the older same-context contact cannot become current
    expect(current).toBe(false)
  })

  it("accepts the latest same-recipient lookup generation", () => {
    // Given the current recipient resolution completed for generation 2
    const action = {
      kind: "ready" as const,
      data: {
        id: "contact-current",
        phone: "+628123456789",
        displayName: "Current",
        consentGranted: false,
        optedOut: false,
      },
    }

    // When the response carries the current generation
    const current = isContactLookupResultCurrent({
      action,
      request: { generation: 2, recipient: "+628123456789", sessionId: "session-1" },
      requestAction: { kind: "submitting" as const },
      currentGeneration: 2,
      currentRecipient: "+628123456789",
      activeSession: "session-1",
    })

    // Then the current contact may be shown
    expect(current).toBe(true)
  })

  it("rejects a resolution result for a different active session", () => {
    // Given a ready result requested for Session 1
    const action = {
      kind: "ready" as const,
      data: {
        id: "contact-1",
        phone: "+628123456789",
        displayName: "Example",
        consentGranted: false,
        optedOut: false,
      },
    }

    // When the lookup view has moved to Session 2
    const current = isContactLookupResultCurrent({
      action,
      request: { generation: 1, recipient: "+628123456789", sessionId: "session-1" },
      requestAction: { kind: "submitting" as const },
      currentGeneration: 1,
      currentRecipient: "+628123456789",
      activeSession: "session-2",
    })

    // Then the Session 1 contact is not current
    expect(current).toBe(false)
  })

  it("hides consent recorded state for a different contact", () => {
    // Given consent was recorded for a previous contact
    const consentRecorded = isContactConsentCurrent({
      resolvedContactId: "contact-2",
      consentContactId: "contact-1",
      consentRequestToken: 1,
      currentConsentRequestToken: 1,
      requestedConsentGranted: true,
      consentRequestAction: { kind: "submitting" as const },
      consentAction: { kind: "ready", data: { updated: true } },
    })

    // When the lookup now shows another contact
    // Then the old consent result is not displayed
    expect(consentRecorded).toBe(false)
  })

  it("rejects stale consent for the same contact", () => {
    // Given consent was recorded by an older request for the same contact
    const consentRecorded = isContactConsentCurrent({
      resolvedContactId: "contact-1",
      consentContactId: "contact-1",
      consentRequestToken: 1,
      currentConsentRequestToken: 2,
      requestedConsentGranted: true,
      consentRequestAction: { kind: "submitting" as const },
      consentAction: { kind: "ready", data: { updated: true } },
    })

    // When the newer consent request is still the current token
    // Then the older same-contact response is not displayed
    expect(consentRecorded).toBe(false)
  })

  it("accepts current consent for the resolved contact", () => {
    // Given the current consent request completed for the resolved contact
    const consentRecorded = isContactConsentCurrent({
      resolvedContactId: "contact-1",
      consentContactId: "contact-1",
      consentRequestToken: 2,
      currentConsentRequestToken: 2,
      requestedConsentGranted: true,
      consentRequestAction: { kind: "submitting" as const },
      consentAction: { kind: "ready", data: { updated: true } },
    })

    // Then the current consent state is displayed
    expect(consentRecorded).toBe(true)
  })

  it("does not report revoked consent as recorded", () => {
    // Given the current contact consent request explicitly revokes consent
    const consentRecorded = isContactConsentCurrent({
      resolvedContactId: "contact-1",
      consentContactId: "contact-1",
      consentRequestToken: 3,
      currentConsentRequestToken: 3,
      requestedConsentGranted: false,
      consentRequestAction: { kind: "submitting" as const },
      consentAction: { kind: "ready", data: { updated: true } },
    })

    // When the server confirms the revocation
    // Then the UI keeps the consent attestation unchecked
    expect(consentRecorded).toBe(false)
  })

  it("keeps a consent mutation tied to the resolved contact and latest token", () => {
    // Given the latest consent mutation is still pending for the resolved contact
    const current = isContactConsentMutationCurrent({
      resolvedContactId: "contact-1",
      consentContactId: "contact-1",
      consentRequest: { token: 4, contactId: "contact-1", consentGranted: false },
      currentConsentRequestToken: 4,
      consentRequestAction: { kind: "submitting" },
      consentAction: { kind: "ready", data: { updated: true } },
    })
    const stale = isContactConsentMutationCurrent({
      resolvedContactId: "contact-1",
      consentContactId: "contact-1",
      consentRequest: { token: 3, contactId: "contact-1", consentGranted: true },
      currentConsentRequestToken: 4,
      consentRequestAction: { kind: "submitting" },
      consentAction: { kind: "ready", data: { updated: true } },
    })

    // When the two responses are compared
    // Then only the latest request remains eligible to change server-consent state
    expect(current).toBe(true)
    expect(stale).toBe(false)
  })

  it("applies only the latest shared contact action token", () => {
    // Given two shared contact actions, where token 2 is the latest request
    // When each response is checked against the latest token
    const stale = requestTokenIsCurrent(2, 1)
    const current = requestTokenIsCurrent(2, 2)

    // Then only the latest response may update shared dashboard state
    expect(stale).toBe(false)
    expect(current).toBe(true)
  })
})
