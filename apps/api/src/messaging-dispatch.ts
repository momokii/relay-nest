import type { DurableDispatch, MessagingPrincipal, SendInput, SendResult } from "./messaging-types"

export function completedKey(principal: MessagingPrincipal, input: SendInput): string {
  return `${principal.userId}:${input.accountScope}:${input.sessionId}:${input.idempotencyKey}`
}

function assertNever(value: never): never {
  throw new Error(`Unexpected durable dispatch state: ${String(value)}`)
}

export function resultFromDurable(dispatch: DurableDispatch): SendResult {
  switch (dispatch.state) {
    case "scheduled":
    case "queued":
    case "attempting":
      return { state: "scheduled", jobId: dispatch.jobId }
    case "submitted":
    case "acknowledged":
      return dispatch.providerMessageId
        ? { state: dispatch.state, providerMessageId: dispatch.providerMessageId }
        : { state: "unknown", recoveryCode: "provider_message_id_missing" }
    case "failed":
    case "unknown":
      return { state: dispatch.state, recoveryCode: dispatch.recoveryCode ?? "provider_unknown" }
    case "cancelled":
      return { state: "unknown", recoveryCode: "cancelled" }
    default:
      return assertNever(dispatch.state)
  }
}

export function resultFromDispatch(outcome: {
  readonly state: "submitted" | "acknowledged" | "failed" | "unknown"
  readonly providerMessageId?: string
  readonly recoveryCode?: string
}): SendResult {
  return outcome.state === "submitted" || outcome.state === "acknowledged"
    ? { state: outcome.state, providerMessageId: outcome.providerMessageId ?? "unknown" }
    : { state: outcome.state, recoveryCode: outcome.recoveryCode ?? "provider_error" }
}
