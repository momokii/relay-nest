import {
  WAHA_CONTRACT_VERSION,
  type WahaEnvironment,
  type WahaHealth,
  type WahaPing,
  type WahaServerStatus,
  type WahaSession,
  wahaEnvironmentSchema,
  wahaEnvironmentVariablesSchema,
  wahaHealthSchema,
  wahaPingSchema,
  wahaServerStatusSchema,
  wahaSessionsSchema,
} from "@waha-command-center/waha-contracts"

import { sanitizeWahaEnvironment, type WahaSafeEnvironment } from "./environment"
import {
  WahaCapabilityError,
  type WahaErrorClassification,
  WahaHttpError,
  WahaNetworkError,
  WahaRequestCancelledError,
  WahaRequestTimeoutError,
  WahaResponseError,
} from "./errors"
import { createWahaSessionOperations, type WahaRequestOptions } from "./session-adapter"
import { validateWahaBaseUrl } from "./url-policy"

type WahaFetch = (input: string | URL, init?: RequestInit) => Promise<Response>
export type WahaClientOptions = {
  readonly baseUrl: string
  readonly apiKey: string
  readonly timeoutMs?: number
  readonly allowLoopback?: boolean
  readonly fetch?: WahaFetch
}

export type WahaServiceStatus = "healthy" | "unhealthy" | "unknown"
export type WahaSessionConnectivity = "connected" | "disconnected" | "unknown"

export type WahaHealthReport = {
  readonly service: {
    readonly status: WahaServiceStatus
    readonly ping: WahaPing
    readonly health: WahaHealth
    readonly version: WahaEnvironment
    readonly environment: WahaSafeEnvironment
    readonly serverStatus: WahaServerStatus
  }
  readonly sessionConnectivity: {
    readonly status: WahaSessionConnectivity
    readonly sessions: readonly WahaSession[]
  }
}

export type WahaCapabilityReport = {
  readonly version: WahaEnvironment
  readonly capabilities: readonly (
    | "health"
    | "sessions"
    | "session-lifecycle"
    | "linking"
    | "safety"
    | "passkey"
  )[]
}

const supportedEngines = ["WEBJS", "WPP", "GOWS", "NOWEB"] as const

function classifyHttpStatus(
  status: number,
): Exclude<
  WahaErrorClassification,
  "malformed_response" | "network" | "timeout" | "cancelled" | "unsupported_capability"
> {
  if (status === 401 || status === 403) return "authentication"
  if (status === 463) return "timelock"
  if (status === 475) return "capping"
  return "http"
}

function responseSchemaError(path: string): WahaResponseError {
  return new WahaResponseError(path)
}

const QR_SCAN_STATE = "SCAN_QR_CODE"
const QR_STATE_DETAIL =
  "The WhatsApp provider expects the session to be in the QR-scan state. Start the session and try again."
const DUPLICATE_NAME_DETAIL =
  "The WhatsApp provider already has a session with this name. Choose a different name."

async function rejectionDetail(response: Response): Promise<string | undefined> {
  const text = (await response.text().catch(() => "")).trim()
  if (text.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  if (parsed === null || typeof parsed !== "object") return undefined
  if (
    "expected" in parsed &&
    Array.isArray(parsed.expected) &&
    parsed.expected.includes(QR_SCAN_STATE)
  )
    return QR_STATE_DETAIL
  const reason =
    "message" in parsed && typeof parsed.message === "string"
      ? parsed.message
      : "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : undefined
  if (reason !== undefined && /already exists/i.test(reason)) return DUPLICATE_NAME_DETAIL
  return undefined
}

function isConnected(status: WahaSession["status"]): boolean {
  return status === "WORKING"
}

function deriveSessionConnectivity(sessions: readonly WahaSession[]): WahaSessionConnectivity {
  if (sessions.length === 0) return "unknown"
  if (sessions.every((session) => isConnected(session.status))) return "connected"
  return "disconnected"
}

export function createWahaClient(options: WahaClientOptions) {
  const baseUrl = validateWahaBaseUrl(options.baseUrl, options.allowLoopback ?? false)
  const timeoutMs = options.timeoutMs ?? 5_000
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
    throw new RangeError("WAHA timeout must be positive")
  if (options.apiKey.length === 0) throw new Error("WAHA API key is required")
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)

  async function request<T>(
    path: string,
    schema: {
      safeParse: (
        value: unknown,
      ) => { readonly success: true; readonly data: T } | { readonly success: false }
    },
    config?: WahaRequestOptions | AbortSignal,
  ): Promise<T> {
    const requestOptions = config instanceof AbortSignal ? { signal: config } : config
    const signal = requestOptions?.signal
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onAbort = (): void => controller.abort()
    if (signal?.aborted) {
      clearTimeout(timeout)
      throw new WahaRequestCancelledError(path)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    try {
      const response = await fetcher(new URL(path, baseUrl), {
        method: requestOptions?.method ?? "GET",
        headers: {
          "X-Api-Key": options.apiKey,
          Accept: "application/json",
          ...(requestOptions?.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(requestOptions?.body ? { body: requestOptions.body } : {}),
        signal: controller.signal,
      })
      if (!response.ok)
        throw new WahaHttpError(
          response.status,
          path,
          classifyHttpStatus(response.status),
          await rejectionDetail(response),
        )
      let payload: unknown
      try {
        const text = await response.text()
        payload = text.length === 0 ? undefined : JSON.parse(text)
      } catch (error) {
        if (error instanceof SyntaxError) throw responseSchemaError(path)
        throw error
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) throw responseSchemaError(path)
      return parsed.data
    } catch (error) {
      if (error instanceof WahaHttpError || error instanceof WahaResponseError) throw error
      if (timedOut) throw new WahaRequestTimeoutError(path, timeoutMs)
      if (signal?.aborted) throw new WahaRequestCancelledError(path)
      if (error instanceof TypeError) throw new WahaNetworkError(path)
      throw error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
    }
  }

  return {
    ping: (signal?: AbortSignal) => request("/ping", wahaPingSchema, signal),
    health: (signal?: AbortSignal) => request("/health", wahaHealthSchema, signal),
    version: (signal?: AbortSignal) =>
      request("/api/server/version", wahaEnvironmentSchema, signal),
    async environment(signal?: AbortSignal): Promise<WahaSafeEnvironment> {
      const environment = await request(
        "/api/server/environment",
        wahaEnvironmentVariablesSchema,
        signal,
      )
      return sanitizeWahaEnvironment(environment)
    },
    serverStatus: (signal?: AbortSignal) =>
      request("/api/server/status", wahaServerStatusSchema, signal),
    sessions: (signal?: AbortSignal) => request("/api/sessions", wahaSessionsSchema, signal),
    ...createWahaSessionOperations(request),
    async checkHealth(signal?: AbortSignal): Promise<WahaHealthReport> {
      const [ping, health, version, environment, serverStatus, sessions] = await Promise.all([
        request("/ping", wahaPingSchema, signal),
        request("/health", wahaHealthSchema, signal),
        request("/api/server/version", wahaEnvironmentSchema, signal),
        request("/api/server/environment", wahaEnvironmentVariablesSchema, signal),
        request("/api/server/status", wahaServerStatusSchema, signal),
        request("/api/sessions", wahaSessionsSchema, signal),
      ])
      return {
        service: {
          status: health.status === "ok" && ping.message === "pong" ? "healthy" : "unhealthy",
          ping,
          health,
          version,
          environment: sanitizeWahaEnvironment(environment),
          serverStatus,
        },
        sessionConnectivity: { status: deriveSessionConnectivity(sessions), sessions },
      }
    },
    async negotiateCapabilities(signal?: AbortSignal): Promise<WahaCapabilityReport> {
      const version = await request("/api/server/version", wahaEnvironmentSchema, signal)
      if (version.version !== WAHA_CONTRACT_VERSION) {
        throw new WahaCapabilityError("pinned-contract", version.version, version.engine)
      }
      if (!supportedEngines.some((engine) => engine === version.engine)) {
        throw new WahaCapabilityError("engine", version.version, version.engine)
      }
      const capabilities = ["health", "sessions", "session-lifecycle", "linking", "safety"] as const
      return {
        version,
        capabilities: version.engine === "GOWS" ? [...capabilities, "passkey"] : capabilities,
      }
    },
  }
}

export type WahaClient = ReturnType<typeof createWahaClient>
