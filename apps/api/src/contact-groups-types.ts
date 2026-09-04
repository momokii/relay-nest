import type { AccountScope } from "./db/schema/shared"

export type ContactGroup = {
  readonly id: string
  readonly accountScope: AccountScope
  readonly name: string
  readonly createdBy: string
  readonly createdAt: Date
}

export type ContactGroupMember = {
  readonly id: string
  readonly groupId: string
  readonly contactId: string | null
  readonly phone: string | null
  readonly accountScope: AccountScope
  readonly createdAt: Date
}

export type ContactGroupMemberInput = { readonly contactId: string } | { readonly phone: string }

export type ContactGroupRepository = {
  readonly hasMember?: (
    accountScope: AccountScope,
    sessionId: string,
    groupId: string,
    phone: string,
  ) => Promise<boolean>
  readonly hasGrant: (
    userId: string,
    groupId: string,
    accountScope: AccountScope,
  ) => Promise<boolean>
  readonly create: (input: {
    readonly userId: string
    readonly accountScope: AccountScope
    readonly name: string
  }) => Promise<ContactGroup>
  readonly list: (userId: string, accountScope: AccountScope) => Promise<readonly ContactGroup[]>
  readonly addMember: (
    userId: string,
    accountScope: AccountScope,
    groupId: string,
    input: ContactGroupMemberInput,
  ) => Promise<ContactGroupMember>
  readonly listMembers: (
    userId: string,
    accountScope: AccountScope,
    groupId: string,
  ) => Promise<readonly ContactGroupMember[]>
  readonly removeMember: (
    userId: string,
    accountScope: AccountScope,
    groupId: string,
    memberId: string,
  ) => Promise<boolean>
}
