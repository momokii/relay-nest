import { resolve } from "node:path"

import type { ReleaseDiagnostic, ReleaseOptions } from "./release-checks.mts"
import { scanBoundedTextFiles } from "./release-fs.mts"
import {
  DEVELOPMENT_ENCRYPTION_PLACEHOLDER,
  DOCKER_SECRET_ASSIGNMENT_PATTERN,
  isSafePlaceholder,
  SECRET_ASSIGNMENT_PATTERN,
  SECRET_PATTERNS,
} from "./secret-patterns.mts"

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "build",
  "dist",
  "coverage",
  "test-results",
  "temp",
  "tmp",
  ".tmp",
  ".codegraph",
  "generated",
])

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avif",
  ".class",
  ".db",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".so",
  ".tar",
  ".ttf",
  ".woff",
  ".woff2",
  ".zip",
])

const SECRET_REMEDIATION = "remove secret material and inject it through the approved secret store"

type TextFile = {
  readonly path: string
  readonly contents: string
}

function assignmentIsSafe(line: string, value: string): boolean {
  if (isSafePlaceholder(value)) return true
  if (line.trimStart().startsWith("#") && DEVELOPMENT_ENCRYPTION_PLACEHOLDER.test(value))
    return true
  return false
}

function normalizeAssignmentValue(value: string): string {
  return value.replace(/^["'`]/, "").replace(/["'`,;)]+$/, "")
}

function isComposePath(path: string): boolean {
  return /(?:^|\/)(?:docker-compose[^/]*|compose[^/]*)\.ya?ml$/i.test(path)
}

function credentialUrlIsSafe(line: string): boolean {
  const match = /\b[a-z][a-z0-9+.-]*:\/\/([^\s/@:]+):([^\s/@]+)@([^\s/]+)/i.exec(line)
  if (match === null) return false
  const username = match[1]
  const password = match[2]
  const host = match[3]
  if (username === undefined || password === undefined || host === undefined) return false
  if (isSafePlaceholder(password)) return true
  if (/[${()}]/.test(username) || /[${()}]/.test(password)) return true
  return /^(?:localhost|127\.0\.0\.1|postgres)$/.test(host.split(":")[0] ?? "")
}

function diagnostic(
  path: string,
  line: number,
  rule: string,
  remediation: string,
): ReleaseDiagnostic {
  return { path, line, rule, remediation }
}

function rootDiagnostic(): ReleaseDiagnostic {
  return diagnostic("<root>", 0, "secret-scan-input", "provide a readable repository root")
}

function scanLine(path: string, lineNumber: number, line: string): ReleaseDiagnostic | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.pattern.test(line)) {
      if (pattern.rule === "credential-url" && credentialUrlIsSafe(line)) continue
      return diagnostic(path, lineNumber, pattern.rule, pattern.remediation)
    }
  }
  const assignment = SECRET_ASSIGNMENT_PATTERN.exec(line)
  if (assignment !== null) {
    const value = assignment[1]
    if (
      value !== undefined &&
      !value.startsWith("/") &&
      !assignmentIsSafe(line, normalizeAssignmentValue(value))
    ) {
      return diagnostic(path, lineNumber, "secret-value", SECRET_REMEDIATION)
    }
  }
  if (isComposePath(path)) {
    const dockerAssignment = DOCKER_SECRET_ASSIGNMENT_PATTERN.exec(line)
    const value = dockerAssignment?.[1]
    if (value !== undefined && !assignmentIsSafe(line, normalizeAssignmentValue(value))) {
      return diagnostic(path, lineNumber, "docker-secret-value", SECRET_REMEDIATION)
    }
  }
  return null
}

function scanFile(file: TextFile): readonly ReleaseDiagnostic[] {
  const diagnostics: ReleaseDiagnostic[] = []
  for (const [index, line] of file.contents.split("\n").entries()) {
    const found = scanLine(file.path, index + 1, line)
    if (found !== null) diagnostics.push(found)
  }
  return diagnostics
}

export function checkSecrets(options: ReleaseOptions): readonly ReleaseDiagnostic[] {
  const root = resolve(options.root)
  const result = scanBoundedTextFiles({
    root,
    excludedDirectories: EXCLUDED_DIRECTORIES,
    excludedPath: () => false,
    binaryExtensions: BINARY_EXTENSIONS,
  })
  if (result.kind === "input-limit") return [rootDiagnostic()]
  return result.files.flatMap(scanFile)
}
