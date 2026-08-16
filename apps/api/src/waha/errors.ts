export const WAHA_ERROR_CLASSIFICATIONS = {
  authentication: "authentication",
  capping: "capping",
  cancelled: "cancelled",
  http: "http",
  malformed_response: "malformed_response",
  network: "network",
  timeout: "timeout",
  timelock: "timelock",
  unsupported_capability: "unsupported_capability",
} as const

export type WahaErrorClassification =
  (typeof WAHA_ERROR_CLASSIFICATIONS)[keyof typeof WAHA_ERROR_CLASSIFICATIONS]

export class WahaError extends Error {
  readonly name: string = "WahaError"
}

export class WahaHttpError extends WahaError {
  readonly name = "WahaHttpError"

  constructor(
    readonly status: number,
    readonly path: string,
    readonly classification: Exclude<
      WahaErrorClassification,
      "malformed_response" | "network" | "timeout" | "cancelled" | "unsupported_capability"
    >,
  ) {
    super(`WAHA request failed: ${classification} (${status})`)
  }
}

export class WahaResponseError extends WahaError {
  readonly name = "WahaResponseError"
  readonly classification = "malformed_response" as const

  constructor(readonly path: string) {
    super(`WAHA response was malformed for ${path}`)
  }
}

export class WahaNetworkError extends WahaError {
  readonly name = "WahaNetworkError"
  readonly classification = "network" as const

  constructor(readonly path: string) {
    super(`WAHA network request failed for ${path}`)
  }
}

export class WahaRequestTimeoutError extends WahaError {
  readonly name = "WahaRequestTimeoutError"
  readonly classification = "timeout" as const

  constructor(
    readonly path: string,
    readonly timeoutMs: number,
  ) {
    super(`WAHA request timed out for ${path}`)
  }
}

export class WahaRequestCancelledError extends WahaError {
  readonly name = "WahaRequestCancelledError"
  readonly classification = "cancelled" as const

  constructor(readonly path: string) {
    super(`WAHA request cancelled for ${path}`)
  }
}

export class WahaCapabilityError extends WahaError {
  readonly name = "WahaCapabilityError"
  readonly classification = "unsupported_capability" as const

  constructor(
    readonly capability: string,
    readonly version: string,
    readonly engine: string,
  ) {
    super(`WAHA capability ${capability} is unsupported by ${version}/${engine}`)
  }
}
