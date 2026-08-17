import { z } from "zod"

export const RETENTION_CATEGORIES = [
  "messages",
  "contacts",
  "events",
  "notifications",
  "audit",
] as const

export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number]

export const retentionPolicySchema = z.object({
  category: z.enum(RETENTION_CATEGORIES),
  retentionDays: z.number().int().min(1).max(3650),
})

export type RetentionPolicyInput = z.infer<typeof retentionPolicySchema>

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 86_400_000)
}
