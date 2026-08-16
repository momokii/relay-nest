import { WahaHttpError, WahaNetworkError, WahaRequestTimeoutError } from "../waha/errors"
import type { DispatchResult } from "./types"

export function classifyWahaDispatchError(error: unknown): DispatchResult {
  if (error instanceof WahaHttpError && error.status === 463) {
    return { state: "failed", failureCode: "waha_463", recoveryCode: "timelock_active" }
  }
  if (error instanceof WahaHttpError && error.status === 475) {
    return { state: "failed", failureCode: "waha_475", recoveryCode: "session_capped" }
  }
  if (error instanceof WahaRequestTimeoutError || error instanceof WahaNetworkError) {
    return {
      state: "unknown",
      failureCode: error.classification,
      recoveryCode: "provider_unavailable",
    }
  }
  return { state: "failed", failureCode: "provider_error", recoveryCode: "provider_rejected" }
}
