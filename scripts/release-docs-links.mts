import { realpathSync, statSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"

import type { ReleaseDiagnostic } from "./release-checks.mts"
import { withoutCodeBlocks } from "./release-docs-markdown.mts"
import { EXTERNAL_LINK, MARKDOWN_LINK } from "./release-docs-rules.mts"
import {
  MAX_MARKDOWN_FILE_BYTES,
  type MarkdownFile,
  readBoundedTextAt,
} from "./release-docs-traversal.mts"

type LinkDiagnostics =
  | { readonly kind: "complete"; readonly diagnostics: readonly ReleaseDiagnostic[] }
  | { readonly kind: "input-limit" }

type LinkScanState = {
  localLinks: number
  fragmentTargets: number
  linkedTargetBytes: number
}

type LinkScanContext = {
  readonly root: string
  readonly rootDescriptor: number
  readonly state: LinkScanState
}

const MAX_FRAGMENT_TARGETS = 256
const MAX_LINKED_TARGET_BYTES = 8 * 1024 * 1024
export const MAX_LOCAL_LINKS = 8_192

function diagnostic(
  path: string,
  line: number,
  rule: string,
  remediation: string,
): ReleaseDiagnostic {
  return { path, line, rule, remediation }
}

function lineNumber(contents: string, offset: number): number {
  return contents.slice(0, offset).split("\n").length
}

function decodeFragment(fragment: string): string | null {
  try {
    return decodeURIComponent(fragment)
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

function decodePath(path: string): string | null {
  try {
    return path
      .split("/")
      .map((component) => decodeURIComponent(component))
      .join("/")
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

function headingSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s-]+/g, "-")
}

function hasHeading(contents: string, fragment: string): boolean {
  const decodedFragment = decodeFragment(fragment)
  if (decodedFragment === null) return false
  const expectedSlug = headingSlug(decodedFragment)
  return contents.split("\n").some((line) => {
    if (!/^\s*#+\s+/.test(line)) return false
    const heading = line.replace(/^\s*#+\s+/, "").replace(/\s+#+\s*$/, "")
    return headingSlug(heading) === expectedSlug
  })
}

function isWithinRoot(root: string, target: string): boolean {
  const targetRelative = relative(root, target)
  return (
    targetRelative === "" ||
    (targetRelative.split(/[\\/]/u)[0] !== ".." && !isAbsolute(targetRelative))
  )
}

function brokenLinkDiagnostic(file: MarkdownFile, index: number): ReleaseDiagnostic {
  return diagnostic(
    file.path,
    lineNumber(file.contents, index),
    "documentation-link-broken",
    "restore the referenced repository document or remove the link",
  )
}

export function scanLinks(context: LinkScanContext, file: MarkdownFile): LinkDiagnostics {
  const { root, rootDescriptor, state } = context
  const diagnostics: ReleaseDiagnostic[] = []
  for (const match of withoutCodeBlocks(file.contents).matchAll(MARKDOWN_LINK)) {
    const target = match[1]
    const index = match.index
    if (target === undefined || index === undefined || EXTERNAL_LINK.test(target)) continue
    state.localLinks += 1
    if (state.localLinks > MAX_LOCAL_LINKS) return { kind: "input-limit" }
    const [rawPath, fragment] = target.split("#", 2)
    const decodedPath = rawPath === undefined ? "" : decodePath(rawPath)
    if (decodedPath === null) {
      diagnostics.push(brokenLinkDiagnostic(file, index))
      continue
    }
    const targetPath =
      decodedPath === "" ? resolve(root, file.path) : resolve(root, dirname(file.path), decodedPath)
    let resolvedTarget: string
    try {
      resolvedTarget = realpathSync(targetPath)
      if (!isWithinRoot(root, resolvedTarget) || !statSync(resolvedTarget).isFile()) {
        diagnostics.push(brokenLinkDiagnostic(file, index))
        continue
      }
    } catch (error) {
      if (!isFileSystemError(error)) throw error
      diagnostics.push(brokenLinkDiagnostic(file, index))
      continue
    }
    if (fragment === undefined) continue
    state.fragmentTargets += 1
    if (state.fragmentTargets > MAX_FRAGMENT_TARGETS) return { kind: "input-limit" }
    try {
      const result = readBoundedTextAt(
        rootDescriptor,
        relative(root, resolvedTarget).split("\\").join("/"),
        MAX_MARKDOWN_FILE_BYTES,
      )
      if (result.kind === "input-limit") return result
      state.linkedTargetBytes += result.bytes
      if (state.linkedTargetBytes > MAX_LINKED_TARGET_BYTES) return { kind: "input-limit" }
      if (!hasHeading(withoutCodeBlocks(result.contents), fragment)) {
        diagnostics.push(
          diagnostic(
            file.path,
            lineNumber(file.contents, match.index),
            "documentation-anchor-broken",
            "restore the referenced heading or remove the anchor",
          ),
        )
      }
    } catch (error) {
      if (!isFileSystemError(error)) throw error
      diagnostics.push(brokenLinkDiagnostic(file, index))
    }
  }
  return { kind: "complete", diagnostics }
}

type FileSystemError = Error & { readonly code: string }
function isFileSystemError(error: unknown): error is FileSystemError {
  return error instanceof Error && "code" in error && typeof error.code === "string"
}
