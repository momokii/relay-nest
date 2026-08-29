import { randomUUID } from "node:crypto"

import { completedKey, resultFromDispatch, resultFromDurable } from "./messaging-dispatch"
import type {
  ContactTarget,
  MessagingContact,
  MessagingPrincipal,
  MessagingServiceOptions,
  MessagingSession,
  SafeContact,
  ScheduleInput,
  SendInput,
  SendResult,
} from "./messaging-types"

export type {
  ContactTarget,
  DurableDispatch,
  MessagingContact,
  MessagingFailureCode,
  MessagingPrincipal,
  MessagingScheduler,
  MessagingServiceOptions,
  MessagingSession,
  MessagingWaha,
  SafeContact,
  SafetyDecision,
  ScheduleInput,
  SendInput,
  SendResult,
} from "./messaging-types"

export class MessagingInputError extends Error {
  readonly name = "MessagingInputError"
}

export function normalizePhoneNumber(input: string): string {
  const compact = input.trim().replace(/[\s().-]/g, "")
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
    throw new MessagingInputError("international phone number is invalid")
  }
  return compact
}

const PROVIDER_CHAT_SUFFIXES = ["@c.us", "@lid"] as const

function isProviderChatId(chatId: string): boolean {
  return PROVIDER_CHAT_SUFFIXES.some((suffix) => chatId.endsWith(suffix))
}

function isChatAddressRecipient(value: string): boolean {
  return /^\d+@(c\.us|lid|g\.us)$/.test(value.trim())
}

export function createMessagingService(options: MessagingServiceOptions) {
  const now = options.now ?? (() => new Date())
  const completed = new Map<string, SendResult>()

  function timezoneFor(input: SendInput): string {
    if ("timezone" in input && typeof input.timezone === "string") return input.timezone
    return "UTC"
  }

  async function authorized(
    principal: MessagingPrincipal,
    sessionId: string,
    accountScope: MessagingSession["accountScope"],
  ): Promise<MessagingSession | null> {
    const decision = await options.authorize(principal, sessionId, accountScope)
    if (!decision.allowed) return null
    return options.sessions.find(sessionId, accountScope)
  }

  async function resolveInternal(
    principal: MessagingPrincipal,
    sessionId: string,
    accountScope: MessagingSession["accountScope"],
    target: ContactTarget,
  ): Promise<MessagingContact | null> {
    const session = await authorized(principal, sessionId, accountScope)
    if (!session) return null
    const client = await options.wahaForSession(session)
    const address = "phoneNumber" in target ? target.phoneNumber.trim() : ""
    if (isChatAddressRecipient(address)) {
      const existingAddressed = await options.contacts.find(accountScope, address)
      if (!existingAddressed || existingAddressed.sessionId !== session.id) return null
      return existingAddressed
    }
    if ("phoneNumber" in target) {
      const phone = normalizePhoneNumber(target.phoneNumber)
      const existing = await options.contacts.find(accountScope, phone)
      const checked = await client.checkExists(session.wahaSessionName, phone)
      if (!checked.numberExists || !checked.chatId || !isProviderChatId(checked.chatId)) return null
      const providerContact = await client.contact(session.wahaSessionName, checked.chatId)
      return options.contacts.save({
        id: existing?.id ?? randomUUID(),
        accountScope,
        sessionId,
        phone,
        displayName:
          existing?.displayName ?? providerContact.name ?? providerContact.pushname ?? null,
        providerChatId: checked.chatId,
        consentGranted: existing?.consentGranted ?? false,
        optedOut: existing?.optedOut ?? false,
      })
    }
    const existing = options.contacts.findById
      ? await options.contacts.findById(accountScope, target.contactId)
      : null
    if (!existing || !isProviderChatId(existing.providerChatId)) return null
    return existing
  }

  async function prepare(
    principal: MessagingPrincipal,
    input: SendInput,
  ): Promise<
    { readonly session: MessagingSession; readonly contact: MessagingContact } | SendResult
  > {
    const deny = async (recoveryCode: string): Promise<SendResult> => {
      await options.audit({
        actorUserId: principal.userId,
        action: "message.send_denied",
        subjectType: "dispatch_decision",
        subjectId: input.idempotencyKey,
        accountScope: input.accountScope,
        sessionId: input.sessionId,
      })
      return { state: "failed", recoveryCode }
    }
    const session = await authorized(principal, input.sessionId, input.accountScope)
    if (!session) return deny("unauthorized")
    let contact: MessagingContact | null
    try {
      contact = await resolveInternal(principal, input.sessionId, input.accountScope, input)
    } catch (error) {
      if (error instanceof MessagingInputError) return deny("invalid_phone")
      throw error
    }
    if (!contact) return deny("contact_not_found")
    if (!contact.consentGranted || contact.optedOut) return deny("consent_required")
    const safety = await options.safety.evaluate({
      session,
      contact,
      message: input.message,
      now: now(),
      timezone: timezoneFor(input),
    })
    if (!safety.allowed) return deny(safety.recoveryCode)
    return { session, contact }
  }

  return {
    async resolveContact(
      principal: MessagingPrincipal,
      sessionId: string,
      accountScope: MessagingSession["accountScope"],
      target: ContactTarget,
    ): Promise<SafeContact> {
      const contact = await resolveInternal(principal, sessionId, accountScope, target)
      if (!contact) throw new MessagingInputError("contact was not found")
      return { id: contact.id, phone: contact.phone, displayName: contact.displayName }
    },
    async scheduleText(principal: MessagingPrincipal, input: ScheduleInput): Promise<SendResult> {
      const prepared = await prepare(principal, input)
      if ("state" in prepared) return prepared
      const scheduled = await options.scheduler.schedule({
        sessionId: input.sessionId,
        accountScope: input.accountScope,
        recipientPhone: prepared.contact.phone,
        message: input.message,
        scheduledFor: input.scheduledFor,
        timezone: input.timezone,
        idempotencyKey: input.idempotencyKey,
      })
      await options.audit({
        actorUserId: principal.userId,
        action: scheduled.duplicate ? "message.schedule_duplicate" : "message.scheduled",
        subjectType: "scheduled_job",
        subjectId: scheduled.jobId,
        accountScope: input.accountScope,
        sessionId: input.sessionId,
      })
      return { state: "scheduled", jobId: scheduled.jobId }
    },
    async sendImmediate(principal: MessagingPrincipal, input: SendInput): Promise<SendResult> {
      const prior = completed.get(completedKey(principal, input))
      if (prior) return prior
      const durable = options.scheduler.findByIdempotencyKey
        ? await options.scheduler.findByIdempotencyKey(input.idempotencyKey)
        : null
      if (
        durable &&
        durable.accountScope === input.accountScope &&
        durable.sessionId === input.sessionId
      )
        return resultFromDurable(durable)
      const prepared = await prepare(principal, input)
      if ("state" in prepared) return prepared
      const scheduled = await options.scheduler.schedule({
        sessionId: input.sessionId,
        accountScope: input.accountScope,
        recipientPhone: prepared.contact.phone,
        message: input.message,
        scheduledFor: now(),
        timezone: "UTC",
        idempotencyKey: input.idempotencyKey,
      })
      if (scheduled.duplicate) return { state: "unknown", recoveryCode: "duplicate_command" }
      const outcome = await options.scheduler.dispatch(scheduled.jobId)
      const result = resultFromDispatch(outcome)
      completed.set(completedKey(principal, input), result)
      await options.audit({
        actorUserId: principal.userId,
        action: `message.immediate_${result.state}`,
        subjectType: "scheduled_job",
        subjectId: scheduled.jobId,
        accountScope: input.accountScope,
        sessionId: input.sessionId,
      })
      return result
    },
    async setConsent(
      principal: MessagingPrincipal,
      sessionId: string,
      accountScope: MessagingSession["accountScope"],
      contactId: string,
      consentGranted: boolean,
      optedOut: boolean,
    ): Promise<{ readonly updated: boolean }> {
      const session = await authorized(principal, sessionId, accountScope)
      if (!session || !options.contacts.updateConsent) return { updated: false }
      const ownedContact = options.contacts.findById
        ? await options.contacts.findById(accountScope, contactId)
        : null
      if (!ownedContact || ownedContact.sessionId !== session.id) return { updated: false }
      const updatedContact = await options.contacts.updateConsent(
        accountScope,
        session.id,
        contactId,
        consentGranted,
        optedOut,
      )
      if (!updatedContact) return { updated: false }
      await options.audit({
        actorUserId: principal.userId,
        action: optedOut ? "contact.opted_out" : "contact.consent_updated",
        subjectType: "contact",
        subjectId: contactId,
        accountScope,
        sessionId,
      })
      return { updated: true }
    },
  }
}
