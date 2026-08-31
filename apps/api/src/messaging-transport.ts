import type { AccountScope } from "./db/schema/shared"
import { isSupportedProviderChatId } from "./messaging"
import type { MessagingContact } from "./messaging-types"
import type { DispatchResult, SchedulerJob } from "./scheduler"
import { classifyWahaDispatchError } from "./scheduler"
import type { WahaClient } from "./waha/adapter"

type MessagingTransportContext = {
  readonly session: { readonly wahaSessionName: string }
  readonly client: Pick<WahaClient, "sendText">
}

type MessagingTransportDependencies = {
  readonly clientForSession: (
    sessionId: string,
    accountScope: AccountScope,
  ) => Promise<MessagingTransportContext>
  readonly contacts: {
    readonly find: (
      accountScope: AccountScope,
      sessionId: string,
      phone: string,
    ) => Promise<MessagingContact | null>
  }
}

export function createMessagingTransport(
  dependencies: MessagingTransportDependencies,
): (job: SchedulerJob) => Promise<DispatchResult> {
  return async (job) => {
    try {
      const context = await dependencies.clientForSession(job.sessionId, job.accountScope)
      const contact = await dependencies.contacts.find(
        job.accountScope,
        job.sessionId,
        job.recipientPhone,
      )
      if (!contact) {
        return {
          state: "failed",
          failureCode: "contact_not_found",
          recoveryCode: "contact_not_found",
        }
      }
      if (!contact.consentGranted || contact.optedOut) {
        return {
          state: "failed",
          failureCode: "consent_required",
          recoveryCode: "consent_required",
        }
      }
      if (!isSupportedProviderChatId(contact.providerChatId)) {
        return {
          state: "failed",
          failureCode: "contact_not_found",
          recoveryCode: "contact_not_found",
        }
      }
      const sent = await context.client.sendText(
        context.session.wahaSessionName,
        contact.providerChatId,
        job.message,
      )
      return { state: "submitted", providerMessageId: sent.id }
    } catch (error) {
      return classifyWahaDispatchError(error)
    }
  }
}
