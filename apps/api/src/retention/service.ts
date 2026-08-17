import type { createRetentionRepositories } from "../db/repositories/retention"
import type { AccountScope } from "../db/schema/shared"
import { type RetentionCategory, retentionCutoff, retentionPolicySchema } from "./contracts"

type RetentionRepository = ReturnType<typeof createRetentionRepositories>["retentionPolicies"]

type Audit = (input: {
  readonly actorUserId: string
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
  readonly accountScope: AccountScope
}) => Promise<void>

export function createRetentionService(options: {
  readonly repository: RetentionRepository
  readonly audit: Audit
  readonly now?: () => Date
}) {
  const now = options.now ?? (() => new Date())
  const previews = new Map<
    string,
    {
      readonly accountScope: AccountScope
      readonly category: RetentionCategory
      readonly cutoff: Date
      readonly count: number
      readonly expiresAt: number
    }
  >()
  return {
    list: (accountScope: AccountScope) => options.repository.list(accountScope),
    updatePolicy: async (
      actorUserId: string,
      accountScope: AccountScope,
      input: { readonly category: RetentionCategory; readonly retentionDays: number },
    ) => {
      const parsed = retentionPolicySchema.parse(input)
      const policy = await options.repository.upsert({ accountScope, ...parsed })
      if (!policy) throw new RetentionPolicyWriteError()
      await options.audit({
        actorUserId,
        action: "retention.policy_updated",
        subjectType: "retention_policy",
        subjectId: policy.id,
        accountScope,
      })
      return policy
    },
    preview: async (accountScope: AccountScope, category: RetentionCategory) => {
      const policy = await options.repository.find({ accountScope, category })
      if (!policy) throw new RetentionPolicyMissingError(category)
      const result = await options.repository.preview({
        accountScope,
        category,
        cutoff: retentionCutoff(now(), policy.retentionDays),
      })
      const previewToken = crypto.randomUUID()
      previews.set(previewToken, { ...result, expiresAt: now().getTime() + 10 * 60_000 })
      for (const [token, preview] of previews) {
        if (preview.expiresAt <= now().getTime()) previews.delete(token)
      }
      while (previews.size > 1000) {
        const oldest = previews.keys().next().value
        if (!oldest) break
        previews.delete(oldest)
      }
      return { ...result, previewToken }
    },
    purge: async (input: {
      readonly actorUserId: string
      readonly accountScope: AccountScope
      readonly category: RetentionCategory
      readonly cutoff: Date
      readonly previewCount: number
      readonly previewToken: string
      readonly confirmed: boolean
    }) => {
      if (!input.confirmed) throw new PurgeConfirmationRequiredError()
      const preview = previews.get(input.previewToken)
      if (
        !preview ||
        preview.expiresAt <= now().getTime() ||
        preview.accountScope !== input.accountScope ||
        preview.category !== input.category ||
        preview.cutoff.getTime() !== input.cutoff.getTime() ||
        preview.count !== input.previewCount
      )
        throw new PurgePreviewTokenError()
      previews.delete(input.previewToken)
      return options.repository.purge(input)
    },
  }
}

export class RetentionPolicyMissingError extends Error {
  readonly name = "RetentionPolicyMissingError"
  constructor(readonly category: RetentionCategory) {
    super("retention policy is not configured")
  }
}

export class PurgeConfirmationRequiredError extends Error {
  readonly name = "PurgeConfirmationRequiredError"
  constructor() {
    super("explicit purge confirmation is required")
  }
}

export class RetentionPolicyWriteError extends Error {
  readonly name = "RetentionPolicyWriteError"
  constructor() {
    super("retention policy could not be saved")
  }
}

export class PurgePreviewTokenError extends Error {
  readonly name = "PurgePreviewTokenError"
  constructor() {
    super("retention preview is invalid or expired")
  }
}
