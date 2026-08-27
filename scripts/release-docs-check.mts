import { closeSync, lstatSync } from "node:fs"
import { parse, resolve } from "node:path"

import type { ReleaseDiagnostic, ReleaseOptions } from "./release-checks.mts"
import { scanLinks } from "./release-docs-links.mts"
import { withoutCodeBlocks } from "./release-docs-markdown.mts"
import { REQUIRED_DOCUMENTS, STALE_CLAIMS } from "./release-docs-rules.mts"
import {
  type MarkdownFile,
  openDirectoryNoFollow,
  scanMarkdownFiles,
} from "./release-docs-traversal.mts"

type FileSystemError = Error & { readonly code: string }
type DiagnosticDetails = Pick<ReleaseDiagnostic, "rule" | "remediation">

function isFileSystemError(error: unknown): error is FileSystemError {
  return error instanceof Error && "code" in error && typeof error.code === "string"
}

function diagnostic(path: string, line: number, details: DiagnosticDetails): ReleaseDiagnostic {
  return { path, line, ...details }
}

function requiredDocumentDiagnostics(files: readonly MarkdownFile[]): readonly ReleaseDiagnostic[] {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const diagnostics: ReleaseDiagnostic[] = []
  for (const document of REQUIRED_DOCUMENTS) {
    const file = byPath.get(document.path)
    if (file === undefined) {
      diagnostics.push(
        diagnostic(document.path, 0, {
          rule: "documentation-file-missing",
          remediation: "restore the required source-of-truth document",
        }),
      )
      continue
    }
    const maskedContents = withoutCodeBlocks(file.contents)
    for (const marker of document.markers) {
      if (!maskedContents.includes(marker)) {
        diagnostics.push(
          diagnostic(document.path, 0, {
            rule: "documentation-marker-missing",
            remediation: "restore the required documented release guidance",
          }),
        )
      }
    }
  }
  return diagnostics
}

function lineNumber(contents: string, offset: number): number {
  return contents.slice(0, offset).split("\n").length
}

function staleStatusDiagnostics(file: MarkdownFile): readonly ReleaseDiagnostic[] {
  let match: RegExpMatchArray | null = null
  for (const pattern of STALE_CLAIMS) {
    const candidate = file.contents.match(pattern)
    if (
      candidate?.index !== undefined &&
      (match?.index === undefined || candidate.index < match.index)
    )
      match = candidate
  }
  if (match === null || match.index === undefined) return []
  return [
    diagnostic(file.path, lineNumber(file.contents, match.index), {
      rule: "documentation-freshness",
      remediation: "replace stale release-status guidance with verified repository status",
    }),
  ]
}

const scanInputDiagnostic = (): ReleaseDiagnostic =>
  diagnostic("<root>", 0, {
    rule: "documentation-scan-input",
    remediation: "provide a bounded documentation root",
  })

export function checkDocumentation(options: ReleaseOptions): readonly ReleaseDiagnostic[] {
  const requestedRoot = resolve(options.root)
  const root = requestedRoot
  try {
    const metadata = lstatSync(root)
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || root === parse(root).root) {
      return [scanInputDiagnostic()]
    }
  } catch (error) {
    if (!isFileSystemError(error)) throw error
    return [scanInputDiagnostic()]
  }
  let rootDescriptor: number
  try {
    rootDescriptor = openDirectoryNoFollow(root)
  } catch (error) {
    if (!isFileSystemError(error)) throw error
    return [scanInputDiagnostic()]
  }
  try {
    const result = scanMarkdownFiles(root, rootDescriptor)
    if (result.kind === "input-limit") return [scanInputDiagnostic()]
    const diagnostics = [...requiredDocumentDiagnostics(result.files)]
    const state = { localLinks: 0, fragmentTargets: 0, linkedTargetBytes: 0 }
    for (const file of result.files) {
      diagnostics.push(...staleStatusDiagnostics(file))
      const links = scanLinks({ root, rootDescriptor, state }, file)
      if (links.kind === "input-limit") return [scanInputDiagnostic()]
      diagnostics.push(...links.diagnostics)
    }
    return diagnostics
  } catch (error) {
    if (!isFileSystemError(error)) throw error
    return [scanInputDiagnostic()]
  } finally {
    closeSync(rootDescriptor)
  }
}
