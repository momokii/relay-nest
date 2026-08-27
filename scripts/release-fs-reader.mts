import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs"
import { join, resolve } from "node:path"

import {
  MAX_DEPTH,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_ENTRIES,
} from "./release-fs-limits.mts"

export type BoundedReadResult =
  | { readonly kind: "complete"; readonly contents: string }
  | { readonly kind: "missing" }
  | { readonly kind: "input-limit" }
  | { readonly kind: "invalid" }
  | { readonly kind: "read-error" }

export type BoundedReadState = {
  files: number
  entries: number
  totalBytes: number
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

export function readDescriptor(descriptor: number): string | null {
  const metadata = fstatSync(descriptor)
  if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) return null
  const buffer = Buffer.allocUnsafe(MAX_FILE_BYTES + 1)
  let bytesRead = 0
  while (bytesRead < buffer.byteLength) {
    const count = readSync(descriptor, buffer, bytesRead, buffer.byteLength - bytesRead, null)
    if (count === 0) break
    bytesRead += count
  }
  return bytesRead > MAX_FILE_BYTES ? null : buffer.subarray(0, bytesRead).toString("utf8")
}

function validRelativePath(path: string): boolean {
  return (
    path !== "" &&
    !path.startsWith("/") &&
    !path.split(/[\\/]+/).some((part) => part === "" || part === "." || part === "..")
  )
}

export function createBoundedReadState(): BoundedReadState {
  return { files: 0, entries: 0, totalBytes: 0 }
}

export function readBoundedFile(
  root: string,
  path: string,
  state: BoundedReadState,
): BoundedReadResult {
  if (!validRelativePath(path)) return { kind: "invalid" }
  const rootPath = resolve(root)
  let rootDescriptor: number
  try {
    const metadata = lstatSync(rootPath)
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) return { kind: "invalid" }
    rootDescriptor = openSync(
      rootPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
  } catch (error) {
    if (isFileSystemError(error)) return { kind: "read-error" }
    throw error
  }
  const parts = path.split(/[\\/]+/)
  if (parts.length > MAX_DEPTH + 1) {
    closeSync(rootDescriptor)
    return { kind: "input-limit" }
  }
  const fileName = parts.pop()
  if (fileName === undefined) {
    closeSync(rootDescriptor)
    return { kind: "invalid" }
  }
  const opened: number[] = []
  let parent = rootDescriptor
  try {
    state.entries += parts.length + 1
    if (state.entries > MAX_TOTAL_ENTRIES) return { kind: "input-limit" }
    for (const part of parts) {
      const child = openDirectoryChild(parent, part)
      opened.push(child)
      parent = child
    }
    state.files += 1
    if (state.files > MAX_FILES) return { kind: "input-limit" }
    const descriptor = openSync(
      join(descriptorPath(parent), fileName),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    )
    try {
      const metadata = fstatSync(descriptor)
      if (
        !metadata.isFile() ||
        metadata.size > MAX_FILE_BYTES ||
        state.totalBytes + metadata.size > MAX_TOTAL_BYTES
      ) {
        return { kind: "input-limit" }
      }
      const contents = readDescriptor(descriptor)
      if (contents === null) return { kind: "input-limit" }
      state.totalBytes += Buffer.byteLength(contents)
      return { kind: "complete", contents }
    } finally {
      closeSync(descriptor)
    }
  } catch (error) {
    if (!isFileSystemError(error)) throw error
    if (error.code === "ENOENT") return { kind: "missing" }
    if (error.code === "ELOOP" || error.code === "ENOTDIR") return { kind: "invalid" }
    return { kind: "read-error" }
  } finally {
    for (const descriptor of opened.reverse()) closeSync(descriptor)
    closeSync(rootDescriptor)
  }
}
