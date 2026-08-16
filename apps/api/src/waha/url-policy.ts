import { isIP } from "node:net"

import { WahaError } from "./errors"

const bundledHosts = new Set(["waha", "waha.internal"])

export class WahaConnectionUrlError extends WahaError {
  readonly name = "WahaConnectionUrlError"
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  return (
    parts[0] === 10 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] !== undefined && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 198 && parts[1] === 18)
  )
}

function isLoopbackIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number)
  return parts.length === 4 && parts[0] === 127
}

function mappedIpv4(hostname: string): string | undefined {
  if (!hostname.startsWith("::ffff:")) return undefined
  const suffix = hostname.slice("::ffff:".length)
  if (suffix.includes(".")) return suffix
  const groups = suffix.split(":")
  if (groups.length !== 2) return undefined
  const high = Number.parseInt(groups[0] ?? "", 16)
  const low = Number.parseInt(groups[1] ?? "", 16)
  if (!Number.isInteger(high) || !Number.isInteger(low) || high > 0xffff || low > 0xffff) {
    return undefined
  }
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

export function validateWahaBaseUrl(value: string, allowLoopback = false): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (error) {
    if (error instanceof TypeError) throw new WahaConnectionUrlError("WAHA base URL is invalid")
    throw error
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WahaConnectionUrlError("WAHA base URL must use HTTP or HTTPS")
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new WahaConnectionUrlError("WAHA base URL cannot contain credentials, query, or fragment")
  }
  const hostname = parsed.hostname.toLowerCase()
  const normalizedIp = hostname.replace(/^\[|\]$/g, "")
  const ipv4 = mappedIpv4(normalizedIp) ?? normalizedIp
  const privateIpv4 = isIP(ipv4) === 4 && isPrivateIpv4(ipv4)
  const loopbackIpv4 = isIP(ipv4) === 4 && isLoopbackIpv4(ipv4)
  const loopbackIpv6 = isIP(normalizedIp) === 6 && normalizedIp === "::1"
  const privateIpv6 =
    isIP(normalizedIp) === 6 &&
    (normalizedIp === "::" ||
      normalizedIp.startsWith("fc") ||
      normalizedIp.startsWith("fd") ||
      normalizedIp.startsWith("fe80"))
  if (
    !bundledHosts.has(hostname) &&
    (privateIpv4 ||
      privateIpv6 ||
      (!allowLoopback && hostname === "localhost") ||
      (!allowLoopback && (loopbackIpv4 || loopbackIpv6)))
  ) {
    throw new WahaConnectionUrlError("WAHA base URL targets a private or loopback address")
  }
  return parsed
}
