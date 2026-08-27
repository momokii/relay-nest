import { resolve } from "node:path"

import type { ReleaseDiagnostic, ReleaseOptions } from "./release-checks.mts"
import { scanBoundedTextFiles } from "./release-fs.mts"

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

const SCOPE_SEPARATION =
  /\b(?:personal\s+and\s+business|business\s+and\s+personal)(?:\s+account)?\s+scopes?\s+(?:are|must be)\s+(?:interchangeable|shared|mixed|the same)\b/i
const UNSCOPED_ACCESS =
  /\b(?:unscoped|scope[-_ ]?(?:agnostic|bypass|free)|without[-_ ]scope|ignore[-_ ]scope|skip[-_ ]scope(?:[-_ ]check)?)\b/i
const CROSS_SCOPE_ACCESS =
  /\bcross[-_ ]scope\s+(?:access|read|write|query|sharing)\s+(?:is\s+)?(?:allowed|permitted|unrestricted)\b/i
const SCOPE_LITERAL =
  /["'`]?\b(accountScope|sessionScope)["'`]?\s*:\s*["'`](personal|business)["'`]/gi
const SCOPE_PAIR_WINDOW = 240

const SCOPE_CONTRACT = [
  { path: "CONTEXT.md", marker: /Personal and Business scopes are never interchangeable\./ },
  {
    path: "apps/api/src/auth/authorization.ts",
    marker:
      /^\s*if\s*\(input\.accountScope\s*!==\s*input\.sessionScope\)\s*return\s*\{\s*allowed:\s*false,\s*reason:\s*"scope_denied"\s*\}/m,
  },
  { path: "tests/authz.test.ts", marker: /reason: "scope_denied"/ },
] as const

type TextFile = {
  readonly path: string
  readonly contents: string
}

function diagnostic(
  path: string,
  line: number,
  rule: string,
  remediation: string,
): ReleaseDiagnostic {
  return { path, line, rule, remediation }
}

function scopeMismatch(contents: string): number | null {
  const literals = [...contents.matchAll(SCOPE_LITERAL)]
  for (const [index, literal] of literals.entries()) {
    const name = literal[1]
    const value = literal[2]
    const offset = literal.index
    if (name === undefined || value === undefined || offset === undefined) continue
    const next = literals[index + 1]
    if (next === undefined || next.index === undefined || next.index - offset > SCOPE_PAIR_WINDOW)
      continue
    const nextName = next[1]
    const nextValue = next[2]
    if (
      nextName !== undefined &&
      nextValue !== undefined &&
      name !== nextName &&
      value !== nextValue
    ) {
      return offset
    }
  }
  return null
}

function scanLine(file: TextFile, lineNumber: number, line: string): ReleaseDiagnostic | null {
  if (SCOPE_SEPARATION.test(line) || CROSS_SCOPE_ACCESS.test(line)) {
    return diagnostic(
      file.path,
      lineNumber,
      "scope-separation",
      "keep Personal and Business account scopes strictly separate",
    )
  }
  if (UNSCOPED_ACCESS.test(line)) {
    return diagnostic(
      file.path,
      lineNumber,
      "scope-required",
      "carry the validated account scope through the access path",
    )
  }
  return null
}

function scanFile(file: TextFile): readonly ReleaseDiagnostic[] {
  const diagnostics: ReleaseDiagnostic[] = []
  for (const [index, line] of file.contents.split("\n").entries()) {
    const found = scanLine(file, index + 1, line)
    if (found !== null) diagnostics.push(found)
  }
  return diagnostics
}

export function checkScope(options: ReleaseOptions): readonly ReleaseDiagnostic[] {
  const root = resolve(options.root)
  const result = scanBoundedTextFiles({
    root,
    excludedDirectories: EXCLUDED_DIRECTORIES,
    excludedPath: (path) => path.startsWith("scripts/release-"),
    binaryExtensions: BINARY_EXTENSIONS,
  })
  if (result.kind === "input-limit") {
    return [diagnostic("<root>", 0, "scope-scan-input", "provide a readable repository root")]
  }
  const files: readonly TextFile[] = result.files
  const diagnostics = files.flatMap(scanFile)
  for (const file of files.filter((entry) => !entry.path.startsWith("tests/"))) {
    const mismatchOffset = scopeMismatch(file.contents)
    if (mismatchOffset === null) continue
    const line = file.contents.slice(0, mismatchOffset).split("\n").length
    diagnostics.push(
      diagnostic(file.path, line, "scope-mismatch", "keep accountScope and sessionScope identical"),
    )
  }
  const filesByPath = new Map(files.map((file) => [file.path, file]))
  for (const contract of SCOPE_CONTRACT) {
    const file = filesByPath.get(contract.path)
    if (file !== undefined && contract.marker.test(file.contents)) continue
    diagnostics.push(
      diagnostic(
        contract.path,
        0,
        "scope-contract-missing",
        "restore the authoritative accountScope boundary and its regression evidence",
      ),
    )
  }
  return diagnostics
}
