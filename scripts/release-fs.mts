import { closeSync, constants, type Dirent, lstatSync, openSync, readdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

import {
  MAX_DEPTH,
  MAX_DIRECTORY_ENTRIES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_ENTRIES,
} from "./release-fs-limits.mts"

export {
  MAX_DEPTH,
  MAX_DIRECTORY_ENTRIES,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_ENTRIES,
} from "./release-fs-limits.mts"
export type {
  BoundedReadResult,
  BoundedReadState,
} from "./release-fs-reader.mts"
export {
  createBoundedReadState,
  readBoundedFile,
  readDescriptor,
} from "./release-fs-reader.mts"

import type { BoundedReadState } from "./release-fs-reader.mts"
import { readDescriptor } from "./release-fs-reader.mts"

export type BoundedTextFile = {
  readonly path: string
  readonly contents: string
}

export type BoundedScanResult =
  | { readonly kind: "complete"; readonly files: readonly BoundedTextFile[] }
  | { readonly kind: "input-limit" }

type ScanOptions = {
  readonly root: string
  readonly excludedDirectories: ReadonlySet<string>
  readonly excludedPath: (path: string) => boolean
  readonly binaryExtensions: ReadonlySet<string>
}

type ScanState = {
  readonly files: BoundedTextFile[]
  readonly read: BoundedReadState
}

type FileSystemError = Error & { readonly code: string }

function isFileSystemError(error: unknown): error is FileSystemError {
  return error instanceof Error && "code" in error && typeof error.code === "string"
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

function shouldReadFile(path: string, options: ScanOptions): boolean {
  const parts = path.split("/")
  return (
    !parts.some((part) => options.excludedDirectories.has(part) || part.endsWith(".generated")) &&
    !options.excludedPath(path) &&
    !options.binaryExtensions.has(extname(path).toLowerCase())
  )
}

function collect(
  directory: number,
  relativeDirectory: string,
  depth: number,
  options: ScanOptions,
  state: ScanState,
): BoundedScanResult {
  if (depth > MAX_DEPTH) return { kind: "input-limit" }
  let entries: Dirent<string>[]
  try {
    entries = readdirSync(descriptorPath(directory), { withFileTypes: true })
  } catch (error) {
    if (isFileSystemError(error)) return { kind: "input-limit" }
    throw error
  }
  if (entries.length > MAX_DIRECTORY_ENTRIES) return { kind: "input-limit" }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    state.read.entries += 1
    if (state.read.entries > MAX_TOTAL_ENTRIES) return { kind: "input-limit" }
    const path = join(relativeDirectory, entry.name).split("\\").join("/")
    const excluded =
      path
        .split("/")
        .some((part) => options.excludedDirectories.has(part) || part.endsWith(".generated")) ||
      options.excludedPath(path)
    if (excluded) continue
    if (entry.isSymbolicLink()) return { kind: "input-limit" }
    if (entry.isDirectory()) {
      if (!shouldReadFile(path, options)) continue
      let child: number
      try {
        child = openDirectoryChild(directory, entry.name)
      } catch (error) {
        if (isFileSystemError(error)) return { kind: "input-limit" }
        throw error
      }
      try {
        const result = collect(child, path, depth + 1, options, state)
        if (result.kind === "input-limit") return result
      } finally {
        closeSync(child)
      }
      continue
    }
    if (!entry.isFile()) return { kind: "input-limit" }
    state.read.files += 1
    if (state.read.files > MAX_FILES || !shouldReadFile(path, options)) continue
    let descriptor: number
    try {
      descriptor = openSync(
        join(descriptorPath(directory), entry.name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      )
      let contents: string | null
      try {
        contents = readDescriptor(descriptor)
      } finally {
        closeSync(descriptor)
      }
      if (
        contents === null ||
        state.read.totalBytes + Buffer.byteLength(contents) > MAX_TOTAL_BYTES
      ) {
        return { kind: "input-limit" }
      }
      state.read.totalBytes += Buffer.byteLength(contents)
      state.files.push({ path, contents })
    } catch (error) {
      if (isFileSystemError(error)) return { kind: "input-limit" }
      throw error
    }
  }
  return { kind: "complete", files: state.files }
}

export function scanBoundedTextFiles(options: ScanOptions): BoundedScanResult {
  const root = resolve(options.root)
  try {
    const metadata = lstatSync(root)
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) return { kind: "input-limit" }
    const descriptor = openSync(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      return collect(descriptor, "", 0, options, {
        files: [],
        read: { files: 0, entries: 0, totalBytes: 0 },
      })
    } finally {
      closeSync(descriptor)
    }
  } catch (error) {
    if (isFileSystemError(error)) return { kind: "input-limit" }
    throw error
  }
}
