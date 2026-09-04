import {
  type WahaGroup,
  wahaGroupCreateInputSchema,
  wahaGroupListSchema,
  wahaGroupMutationResponseSchema,
  wahaGroupParticipantInputSchema,
  wahaGroupSchema,
} from "@waha-command-center/waha-contracts"

export type WahaGroupRequest = <T>(
  path: string,
  schema: {
    safeParse: (
      value: unknown,
    ) => { readonly success: true; readonly data: T } | { readonly success: false }
  },
  config?:
    | {
        readonly method?: string
        readonly body?: string
        readonly signal?: AbortSignal | undefined
        readonly timeoutMs?: number
      }
    | AbortSignal,
) => Promise<T>

/**
 * WAHA group mutations require an API key with the `send` scope. The key is
 * attached only by the server adapter; this client is never shipped to the browser.
 */
export function createWahaGroupOperations(request: WahaGroupRequest) {
  const participants = (participantIds: readonly string[]): string =>
    JSON.stringify({ participants: participantIds })

  return {
    createGroup: (
      session: string,
      name: string,
      participantIds: readonly string[],
      signal?: AbortSignal,
    ): Promise<WahaGroup> => {
      const input = wahaGroupCreateInputSchema.parse({
        session,
        name,
        participants: participantIds,
      })
      return request(`/api/${encodeURIComponent(input.session)}/groups`, wahaGroupSchema, {
        method: "POST",
        body: JSON.stringify({ name: input.name, participants: input.participants }),
        signal,
      })
    },
    groups: (session: string, signal?: AbortSignal): Promise<readonly WahaGroup[]> =>
      request(`/api/${encodeURIComponent(session)}/groups`, wahaGroupListSchema, signal),
    addGroupParticipants: (
      session: string,
      groupId: string,
      participantIds: readonly string[],
      signal?: AbortSignal,
    ): Promise<unknown> =>
      request(
        `/api/${encodeURIComponent(session)}/groups/${encodeURIComponent(groupId)}/participants/add`,
        wahaGroupMutationResponseSchema,
        {
          method: "POST",
          body: participants(
            wahaGroupParticipantInputSchema.parse({ participants: participantIds }).participants,
          ),
          signal,
        },
      ),
    removeGroupParticipants: (
      session: string,
      groupId: string,
      participantIds: readonly string[],
      signal?: AbortSignal,
    ): Promise<unknown> =>
      request(
        `/api/${encodeURIComponent(session)}/groups/${encodeURIComponent(groupId)}/participants/remove`,
        wahaGroupMutationResponseSchema,
        {
          method: "POST",
          body: participants(
            wahaGroupParticipantInputSchema.parse({ participants: participantIds }).participants,
          ),
          signal,
        },
      ),
  }
}
