import {
  type WahaCapping,
  type WahaContact,
  type WahaContactExists,
  type WahaMetadata,
  type WahaPasskeyChallenge,
  type WahaPasskeyConfirmation,
  type WahaQrResponse,
  type WahaTimelock,
  wahaCappingSchema,
  wahaContactExistsSchema,
  wahaContactSchema,
  wahaMetadataSchema,
  wahaPasskeyChallengeSchema,
  wahaPasskeyConfirmationSchema,
  wahaSendTextResponseSchema,
  wahaSessionActionResponseSchema,
  wahaTimelockSchema,
} from "@waha-command-center/waha-contracts"
import { z } from "zod"

const emptyResponseSchema = z.undefined()
const wahaQrImageResponseSchema = z
  .object({ mimetype: z.literal("image/png"), data: z.string().min(1) })
  .transform(({ data }) => ({ value: `data:image/png;base64,${data}` }))

export type WahaRequestOptions = {
  readonly method?: string
  readonly body?: string
  readonly signal?: AbortSignal | undefined
}

type WahaRequest = <T>(
  path: string,
  schema: {
    safeParse: (
      value: unknown,
    ) => { readonly success: true; readonly data: T } | { readonly success: false }
  },
  config?: WahaRequestOptions | AbortSignal,
) => Promise<T>

export function createWahaSessionOperations(request: WahaRequest) {
  return {
    session: (name: string, signal?: AbortSignal) =>
      request(`/api/sessions/${encodeURIComponent(name)}`, wahaSessionActionResponseSchema, signal),
    createSession: (body: string, signal?: AbortSignal) =>
      request("/api/sessions", wahaSessionActionResponseSchema, { method: "POST", body, signal }),
    updateSession: (name: string, body: string, signal?: AbortSignal) =>
      request(`/api/sessions/${encodeURIComponent(name)}`, wahaSessionActionResponseSchema, {
        method: "PUT",
        body,
        signal,
      }),
    remove: (name: string, signal?: AbortSignal) =>
      request(`/api/sessions/${encodeURIComponent(name)}`, emptyResponseSchema, {
        method: "DELETE",
        signal,
      }),
    start: (name: string, signal?: AbortSignal) =>
      request(`/api/sessions/${encodeURIComponent(name)}/start`, wahaSessionActionResponseSchema, {
        method: "POST",
        signal,
      }),
    stop: (name: string, signal?: AbortSignal) =>
      request(`/api/sessions/${encodeURIComponent(name)}/stop`, wahaSessionActionResponseSchema, {
        method: "POST",
        signal,
      }),
    restart: (name: string, signal?: AbortSignal) =>
      request(
        `/api/sessions/${encodeURIComponent(name)}/restart`,
        wahaSessionActionResponseSchema,
        {
          method: "POST",
          signal,
        },
      ),
    logout: (name: string, signal?: AbortSignal) =>
      request(`/api/sessions/${encodeURIComponent(name)}/logout`, wahaSessionActionResponseSchema, {
        method: "POST",
        signal,
      }),
    qr: (name: string, format: "image", signal?: AbortSignal): Promise<WahaQrResponse> =>
      request(
        `/api/${encodeURIComponent(name)}/auth/qr?format=${format}`,
        wahaQrImageResponseSchema,
        signal,
      ),
    requestPairingCode: (name: string, phoneNumber: string, signal?: AbortSignal) =>
      request(`/api/${encodeURIComponent(name)}/auth/request-code`, emptyResponseSchema, {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
        signal,
      }),
    passkeyChallenge: (name: string, signal?: AbortSignal): Promise<WahaPasskeyChallenge> =>
      request(
        `/api/${encodeURIComponent(name)}/auth/passkey/challenge`,
        wahaPasskeyChallengeSchema,
        signal,
      ),
    passkeyAssertion: (name: string, body: string, signal?: AbortSignal) =>
      request(`/api/${encodeURIComponent(name)}/auth/passkey`, emptyResponseSchema, {
        method: "POST",
        body,
        signal,
      }),
    passkeyConfirmation: (name: string, signal?: AbortSignal): Promise<WahaPasskeyConfirmation> =>
      request(
        `/api/${encodeURIComponent(name)}/auth/passkey/confirmation`,
        wahaPasskeyConfirmationSchema,
        signal,
      ),
    confirmPasskey: (name: string, signal?: AbortSignal) =>
      request(`/api/${encodeURIComponent(name)}/auth/passkey/confirm`, emptyResponseSchema, {
        method: "POST",
        signal,
      }),
    me: (name: string, signal?: AbortSignal): Promise<WahaMetadata> =>
      request(`/api/sessions/${encodeURIComponent(name)}/me`, wahaMetadataSchema, signal),
    timelock: (name: string, signal?: AbortSignal): Promise<WahaTimelock> =>
      request(`/api/sessions/${encodeURIComponent(name)}/timelock`, wahaTimelockSchema, signal),
    capping: (name: string, signal?: AbortSignal): Promise<WahaCapping> =>
      request(`/api/sessions/${encodeURIComponent(name)}/capping`, wahaCappingSchema, signal),
    checkExists: (
      name: string,
      phoneNumber: string,
      signal?: AbortSignal,
    ): Promise<WahaContactExists> =>
      request(
        `/api/contacts/check-exists?phone=${encodeURIComponent(phoneNumber)}&session=${encodeURIComponent(name)}`,
        wahaContactExistsSchema,
        signal,
      ),
    contact: (name: string, contactId: string, signal?: AbortSignal): Promise<WahaContact> =>
      request(
        `/api/${encodeURIComponent(name)}/contacts/${encodeURIComponent(contactId)}`,
        wahaContactSchema,
        signal,
      ),
    sendText: (name: string, chatId: string, text: string, signal?: AbortSignal) =>
      request(`/api/sendText`, wahaSendTextResponseSchema, {
        method: "POST",
        body: JSON.stringify({ session: name, chatId, text }),
        signal,
      }),
  }
}
