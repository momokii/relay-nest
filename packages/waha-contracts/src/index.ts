import { z } from "zod"

const workerSchema = z.object({ id: z.string().nullable() })
const healthDetailSchema = z
  .object({ status: z.string(), message: z.string().optional() })
  .passthrough()

export const wahaPingSchema = z.object({ message: z.string() })

export const wahaHealthSchema = z
  .object({
    status: z.string(),
    info: z.record(healthDetailSchema).nullable().optional(),
    error: z.record(healthDetailSchema).nullable().optional(),
    details: z.record(healthDetailSchema).optional(),
  })
  .passthrough()

export const wahaEnvironmentSchema = z.object({
  version: z.string(),
  engine: z.string(),
  tier: z.string(),
  browser: z.string(),
  platform: z.string(),
  worker: workerSchema,
})

export const wahaServerStatusSchema = z.object({
  startTimestamp: z.number(),
  uptime: z.number(),
  worker: workerSchema,
})

export const wahaSessionSchema = z.object({
  name: z.string(),
  presence: z.unknown(),
  timestamps: z.object({ activity: z.number().nullable().optional() }).passthrough(),
  status: z.enum([
    "STOPPED",
    "STARTING",
    "SCAN_QR_CODE",
    "PASSKEY_REQUIRED",
    "PASSKEY_CONFIRMATION_REQUIRED",
    "WORKING",
    "FAILED",
  ]),
  me: z.unknown().optional(),
  assignedWorker: z.string().optional(),
  config: z.record(z.unknown()).optional(),
})

export const wahaSessionsSchema = z.array(wahaSessionSchema)
export const wahaChatsSchema = z.array(
  z
    .object({
      id: z.object({ _serialized: z.string().min(1) }).passthrough(),
      name: z.string().nullable().optional(),
      isGroup: z.boolean().optional(),
      lastMessage: z
        .object({
          body: z.string().nullable().optional(),
          timestamp: z.number().nullable().optional(),
          fromMe: z.boolean().nullable().optional(),
          hasMedia: z.boolean().nullable().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
)
export const wahaMessagesSchema = z.array(
  z
    .object({
      id: z.string().min(1).optional(),
      body: z.string().nullable().optional(),
      timestamp: z.number().nullable().optional(),
      fromMe: z.boolean().nullable().optional(),
      hasMedia: z.boolean().nullable().optional(),
      from: z.string().nullable().optional(),
      participant: z.string().nullable().optional(),
      media: z
        .object({
          url: z.string().nullable().optional(),
          mimetype: z.string().nullable().optional(),
          filename: z.string().nullable().optional(),
        })
        .passthrough()
        .nullable()
        .optional(),
      mimetype: z.string().nullable().optional(),
    })
    .passthrough(),
)
export const wahaSingleMessageSchema = z
  .object({
    id: z.string().min(1).optional(),
    body: z.string().nullable().optional(),
    timestamp: z.number().nullable().optional(),
    fromMe: z.boolean().nullable().optional(),
    hasMedia: z.boolean().nullable().optional(),
    from: z.string().nullable().optional(),
    participant: z.string().nullable().optional(),
    media: z
      .object({
        url: z.string().nullable().optional(),
        mimetype: z.string().nullable().optional(),
        filename: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    mimetype: z.string().nullable().optional(),
  })
  .passthrough()
export const wahaEnvironmentVariablesSchema = z.record(z.unknown())
export const wahaSessionActionResponseSchema = wahaSessionSchema
export const wahaEmptyResponseSchema = z.unknown()
export const wahaQrResponseSchema = z.object({ value: z.string() })
export const wahaMetadataSchema = z.object({
  id: z.string().optional(),
  pushname: z.string().optional(),
})
export const wahaTimelockSchema = z.object({
  locked: z.boolean().optional(),
  until: z.string().optional(),
})
export const wahaCappingSchema = z.object({
  remaining: z.number().optional(),
  resetAt: z.string().optional(),
})
export const wahaPasskeyChallengeSchema = z.object({ challenge: z.string() })
export const wahaPasskeyConfirmationSchema = z.object({ code: z.string() })
export const wahaContactExistsSchema = z.object({
  numberExists: z.boolean(),
  chatId: z.string().min(1).optional(),
})
export const wahaContactSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    pushname: z.string().optional(),
    number: z.string().optional(),
  })
  .passthrough()
export const wahaSendTextResponseSchema = z
  .object({ id: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]) })
  .passthrough()
  .transform((value) => ({ id: typeof value.id === "string" ? value.id : value.id.id }))

export type WahaPing = z.infer<typeof wahaPingSchema>
export type WahaHealth = z.infer<typeof wahaHealthSchema>
export type WahaEnvironment = z.infer<typeof wahaEnvironmentSchema>
export type WahaServerStatus = z.infer<typeof wahaServerStatusSchema>
export type WahaSession = z.infer<typeof wahaSessionSchema>
export type WahaChat = z.infer<typeof wahaChatsSchema>[number]
export type WahaMessage = z.infer<typeof wahaMessagesSchema>[number]
export type WahaSingleMessage = z.infer<typeof wahaSingleMessageSchema>
export type WahaQrResponse = z.infer<typeof wahaQrResponseSchema>
export type WahaMetadata = z.infer<typeof wahaMetadataSchema>
export type WahaTimelock = z.infer<typeof wahaTimelockSchema>
export type WahaCapping = z.infer<typeof wahaCappingSchema>
export type WahaPasskeyChallenge = z.infer<typeof wahaPasskeyChallengeSchema>
export type WahaPasskeyConfirmation = z.infer<typeof wahaPasskeyConfirmationSchema>
export type WahaContactExists = z.infer<typeof wahaContactExistsSchema>
export type WahaContact = z.infer<typeof wahaContactSchema>
export type WahaSendTextResponse = z.infer<typeof wahaSendTextResponseSchema>

export const WAHA_IMAGE = "devlikeapro/waha:latest-2026.8.1" as const
export const WAHA_CONTRACT_VERSION = "2026.8.1" as const
