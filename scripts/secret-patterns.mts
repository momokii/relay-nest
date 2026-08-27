export type SecretPattern = {
  readonly rule: string
  readonly pattern: RegExp
  readonly remediation: string
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    rule: "private-key-block",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
    remediation: "remove private-key material and inject it through the approved secret store",
  },
  {
    rule: "provider-token",
    pattern:
      /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAIza[0-9A-Za-z_-]{30,}\b|\bsk_(?:live|test|proj)-[A-Za-z0-9_-]{16,}\b/,
    remediation: "remove provider credentials and inject them through the approved secret store",
  },
  {
    rule: "jwt-credential",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    remediation: "remove token material and inject credentials through the approved secret store",
  },
  {
    rule: "credential-url",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i,
    remediation:
      "remove embedded URL credentials and inject them through the approved secret store",
  },
] as const

export const SECRET_ASSIGNMENT_PATTERN =
  /^\s*(?:#\s*)?[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|SECRET|ENCRYPTION_KEY)\b\s*=\s*([^\s#]+)/

export const DOCKER_SECRET_ASSIGNMENT_PATTERN =
  /^\s*[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|SECRET|ENCRYPTION_KEY)\b\s*:\s*([^\s#]+)/

export const SAFE_PLACEHOLDERS = [
  "example.invalid",
  "replace-me",
  "<redacted>",
  "<redacted-placeholder>",
  "REDACTED",
] as const

export const INTERPOLATED_PLACEHOLDER = /^\$\{[^}\n]+\}$/
export const DEVELOPMENT_ENCRYPTION_PLACEHOLDER = /^A{43}=$/

export function isSafePlaceholder(value: string): boolean {
  return (
    SAFE_PLACEHOLDERS.some((placeholder) => value === placeholder) ||
    INTERPOLATED_PLACEHOLDER.test(value)
  )
}
