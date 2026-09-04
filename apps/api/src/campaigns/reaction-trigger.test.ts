import { describe, expect, it } from "vitest"

import { createReactionTrigger, type ReactionEvent } from "./reaction-trigger"

const event: ReactionEvent = {
  sessionId: "session-1",
  accountScope: "personal",
  reactionMessageId: "reaction-1",
  sourceMessageId: "group-message-1",
  participant: "628123456789@c.us",
}

function setup(
  member: boolean,
  sendResult:
    | { readonly state: "submitted"; readonly providerMessageId: string }
    | { readonly state: "failed"; readonly recoveryCode: string } = {
    state: "submitted",
    providerMessageId: "sent-1",
  },
) {
  const sent: unknown[] = []
  const audited: string[] = []
  const trigger = createReactionTrigger({
    campaigns: {
      listForReaction: async () => [
        {
          id: "campaign-1",
          accountScope: "personal",
          sessionId: "session-1",
          contactGroupId: "contacts-1",
          followUpMessage: "Thanks for reacting",
          createdBy: "user-1",
        },
      ],
    },
    contactGroups: { hasMember: async () => member },
    messaging: {
      sendImmediate: async (_principal, input) => {
        sent.push(input)
        return sendResult
      },
    },
    audit: async ({ action }) => {
      audited.push(action)
    },
  })
  return { trigger, sent, audited }
}

describe("reaction campaign follow-ups", () => {
  it("sends one immediate 1:1 follow-up for a group member reaction", async () => {
    // Given a sent campaign and a reactor in its contact group
    const fixture = setup(true)

    // When the member reacts
    const result = await fixture.trigger(event)

    // Then the follow-up is submitted to the reactor with a stable dedupe key
    expect(result).toEqual([{ state: "submitted", providerMessageId: "sent-1" }])
    expect(fixture.sent).toHaveLength(1)
    expect(fixture.sent[0]).toMatchObject({
      phoneNumber: "+628123456789",
      idempotencyKey: "campaign:campaign-1:reaction:628123456789@c.us:reaction-1",
    })
  })

  it("does not send to a reactor outside the contact group", async () => {
    // Given a reaction from a non-member
    const fixture = setup(false)

    // When the reaction is handled
    await fixture.trigger(event)

    // Then no 1:1 dispatch is attempted
    expect(fixture.sent).toHaveLength(0)
    expect(fixture.audited).toContain("campaign.reaction_non_member")
  })

  it("makes duplicate reaction delivery idempotent", async () => {
    // Given one member reaction
    const fixture = setup(true)

    // When the same reaction is handled twice
    await fixture.trigger(event)
    await fixture.trigger(event)

    // Then only one immediate dispatch exists
    expect(fixture.sent).toHaveLength(1)
  })

  it("surfaces safety denials without bypassing the messaging safety gate", async () => {
    // Given a member but a messaging safety decision blocked by quiet hours
    const fixture = setup(true, { state: "failed", recoveryCode: "quiet_hours_active" })

    // When the reaction is handled
    const result = await fixture.trigger(event)

    // Then the safety result is retained and no direct provider send is made here
    expect(result).toEqual([{ state: "failed", recoveryCode: "quiet_hours_active" }])
    expect(fixture.sent).toHaveLength(1)
  })
})
