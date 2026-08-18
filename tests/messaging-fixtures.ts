import type { MessagingPrincipal } from "../apps/api/src/messaging"

export const principal: MessagingPrincipal = {
  userId: "user-1",
  roles: ["operator"],
}

export function serviceOptions(overrides: Record<string, unknown> = {}) {
  return {
    authorize: async () => ({ allowed: true as const }),
    sessions: {
      find: async () => ({
        id: "session-1",
        accountScope: "personal" as const,
        wahaSessionName: "personal",
        status: "WORKING",
        linkedAt: new Date("2029-12-01T00:00:00.000Z"),
      }),
    },
    contacts: {
      find: async () => ({
        id: "contact-1",
        phone: "+628123456789",
        displayName: "Example",
        consentGranted: true,
        optedOut: false,
      }),
      save: async (contact: unknown) => contact,
    },
    safety: {
      evaluate: async () => ({ allowed: true as const }),
    },
    scheduler: {
      schedule: async (input: unknown) => ({ jobId: "job-1", duplicate: false, ...input }),
      dispatch: async () => ({ state: "submitted" as const, providerMessageId: "provider-1" }),
    },
    waha: {
      checkExists: async () => ({ numberExists: true, chatId: "628123456789@c.us" }),
      contact: async () => ({ id: "628123456789@c.us", isMyContact: false }),
    },
    wahaForSession: async () => ({
      checkExists: async (session: string, phone: string) => {
        void session
        void phone
        return { numberExists: true, chatId: "628123456789@c.us" }
      },
      contact: async () => ({ id: "628123456789@c.us", name: "Example" }),
    }),
    audit: async () => undefined,
    ...overrides,
  }
}
