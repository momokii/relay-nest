import { closeSync, constants, fstatSync, opendirSync, openSync, readSync } from "node:fs"
import { extname, join, parse, relative } from "node:path"

export type MarkdownFile = { readonly path: string; readonly contents: string }
export type TraversalResult =
  | { readonly kind: "complete"; readonly files: readonly MarkdownFile[] }
  | { readonly kind: "input-limit" }
export type BoundedReadResult =
  | { readonly kind: "complete"; readonly contents: string; readonly bytes: number }
  | { readonly kind: "input-limit" }

type TraversalState = {
  readonly files: MarkdownFile[]
  readonly totalBytes: { value: number }
  readonly totalEntries: { value: number }
}
type TraversalContext = {
  readonly root: string
  readonly state: TraversalState
  readonly relativeDirectory: string
}
type FileSystemEntry = {
  readonly name: string
  readonly isDirectory: () => boolean
  readonly isFile: () => boolean
  readonly isSymbolicLink: () => boolean
}

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
const MAX_DEPTH = 32
const MAX_DIRECTORY_ENTRIES = 4_096
const MAX_TOTAL_DIRECTORY_ENTRIES = 8_192
export const MAX_MARKDOWN_FILE_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_MARKDOWN_BYTES = 32 * 1024 * 1024
const MAX_MARKDOWN_FILES = 10_000

function lexicalCompare(left: FileSystemEntry, right: FileSystemEntry): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

function isExcludedPath(path: string): boolean {
  return path
    .split("/")
    .some((part) => EXCLUDED_DIRECTORIES.has(part) || part.endsWith(".generated"))
}

function descriptorPath(descriptor: number): string {
  return `/proc/self/fd/${descriptor}`
}

function openDirectoryChild(parent: number, name: string): number {
  return openSync(
    join(descriptorPath(parent), name),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
}

export function openDirectoryNoFollow(path: string): number {
  const root = parse(path).root
  let descriptor = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  const opened: number[] = []
  let returned = false
  try {
    for (const part of relative(root, path)
      .split("/")
      .filter((value) => value !== "")) {
      const child = openDirectoryChild(descriptor, part)
      opened.push(descriptor)
      descriptor = child
    }
    returned = true
    return descriptor
  } finally {
    for (const parent of opened) closeSync(parent)
    if (!returned) closeSync(descriptor)
  }
}

function openPathFromRoot(rootDescriptor: number, path: string): number {
  const parts = path.split("/")
  const fileName = parts.pop()
  if (
    fileName === undefined ||
    fileName === "" ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw Object.assign(new Error("unsafe documentation path"), { code: "EINVAL" })
  }
  let parent = rootDescriptor
  const opened: number[] = []
  try {
    for (const part of parts) {
      const child = openDirectoryChild(parent, part)
      opened.push(child)
      parent = child
    }
    return openSync(
      join(descriptorPath(parent), fileName),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    )
  } finally {
    for (const descriptor of opened.reverse()) closeSync(descriptor)
  }
}

function collectMarkdownFiles(
  context: TraversalContext,
  directory: number,
  depth: number,
): TraversalResult {
  if (depth > MAX_DEPTH) return { kind: "input-limit" }
  const entries: FileSystemEntry[] = []
  const handle = opendirSync(descriptorPath(directory))
  try {
    while (true) {
      const entry = handle.readSync()
      if (entry === null) break
      entries.push(entry)
      context.state.totalEntries.value += 1
      if (
        entries.length > MAX_DIRECTORY_ENTRIES ||
        context.state.totalEntries.value > MAX_TOTAL_DIRECTORY_ENTRIES
      ) {
        return { kind: "input-limit" }
      }
    }
  } finally {
    handle.closeSync()
  }
  entries.sort(lexicalCompare)
  for (const entry of entries) {
    const path = join(context.relativeDirectory, entry.name).split("\\").join("/")
    if (entry.isSymbolicLink()) {
      if (isExcludedPath(path)) continue
      return { kind: "input-limit" }
    }
    if (isExcludedPath(path)) continue
    if (entry.isDirectory()) {
      const child = openDirectoryChild(directory, entry.name)
      try {
        const result = collectMarkdownFiles(
          { root: context.root, state: context.state, relativeDirectory: path },
          child,
          depth + 1,
        )
        if (result.kind === "input-limit") return result
      } finally {
        closeSync(child)
      }
      continue
    }
    if (!entry.isFile() || extname(path).toLowerCase() !== ".md") continue
    if (context.state.files.length >= MAX_MARKDOWN_FILES) return { kind: "input-limit" }
    const contents = readBoundedTextAt(directory, entry.name, MAX_MARKDOWN_FILE_BYTES)
    if (contents.kind === "input-limit") return contents
    if (context.state.totalBytes.value + contents.bytes > MAX_TOTAL_MARKDOWN_BYTES)
      return { kind: "input-limit" }
    context.state.totalBytes.value += contents.bytes
    context.state.files.push({
      path: relative(context.root, join(context.root, path)).split("\\").join("/"),
      contents: contents.contents,
    })
  }
  return { kind: "complete", files: context.state.files }
}

export function scanMarkdownFiles(root: string, rootDescriptor: number): TraversalResult {
  return collectMarkdownFiles(
    {
      root,
      state: { files: [], totalBytes: { value: 0 }, totalEntries: { value: 0 } },
      relativeDirectory: "",
    },
    rootDescriptor,
    0,
  )
}

export function readBoundedTextAt(
  rootDescriptor: number,
  path: string,
  maxBytes: number,
): BoundedReadResult {
  const descriptor = openPathFromRoot(rootDescriptor, path)
  try {
    return readBoundedDescriptor(descriptor, maxBytes)
  } finally {
    closeSync(descriptor)
  }
}

function readBoundedDescriptor(descriptor: number, maxBytes: number): BoundedReadResult {
  const metadata = fstatSync(descriptor)
  if (!metadata.isFile() || metadata.size > maxBytes) return { kind: "input-limit" }
  const buffer = Buffer.allocUnsafe(maxBytes + 1)
  let bytesRead = 0
  while (bytesRead < buffer.byteLength) {
    const count = readSync(descriptor, buffer, bytesRead, buffer.byteLength - bytesRead, null)
    if (count === 0) break
    bytesRead += count
  }
  return bytesRead > maxBytes
    ? { kind: "input-limit" }
    : {
        kind: "complete",
        contents: buffer.subarray(0, bytesRead).toString("utf8"),
        bytes: bytesRead,
      }
}
