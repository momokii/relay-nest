const safeEnvironmentKeys = ["NODE_ENV", "TZ", "LANG"] as const

export type WahaSafeEnvironment = Readonly<Record<string, string>>

export function sanitizeWahaEnvironment(
  environment: Readonly<Record<string, unknown>>,
): WahaSafeEnvironment {
  const safeEnvironment: Record<string, string> = {}
  for (const key of safeEnvironmentKeys) {
    const value = environment[key]
    if (typeof value === "string" && value.length <= 128) safeEnvironment[key] = value
  }
  return safeEnvironment
}
