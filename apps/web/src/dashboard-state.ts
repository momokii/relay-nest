import type { ApiResult } from "./dashboard-api"

export type ResourceState<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: T }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "denied"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }

export type ActionState<T> =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "ready"; readonly data: T }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "denied"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }

export function actionFromResult<T>(result: ApiResult<T>): ActionState<T> {
  switch (result.kind) {
    case "ready":
      return { kind: "ready", data: result.data }
    case "unavailable":
      return result
    case "denied":
      return result
    case "error":
      return result
    default:
      return assertNever(result)
  }
}

export function resourceFromResult<T>(result: ApiResult<T>): ResourceState<T> {
  switch (result.kind) {
    case "ready":
      return { kind: "ready", data: result.data }
    case "unavailable":
      return result
    case "denied":
      return result
    case "error":
      return result
    default:
      return assertNever(result)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected API result: ${String(value)}`)
}
