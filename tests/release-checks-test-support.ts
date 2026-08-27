import { cp, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

import {
  type ReleaseCheckResult,
  type ReleaseCommand,
  runReleaseCheck,
} from "../scripts/release-checks.mts"

export const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), "..")

export type RootMutation = (root: string) => Promise<void>
export type RootCheck<T> = (root: string) => Promise<T>

export async function withCopiedRoot<T>(mutate: RootMutation, check: RootCheck<T>): Promise<T> {
  const temporaryParent = await mkdtemp(join(tmpdir(), "relaynest-release-checks-"))
  const copiedRoot = join(temporaryParent, "root")
  try {
    await cp(repositoryRoot, copiedRoot, {
      recursive: true,
      filter: (source) => {
        const relativeSource = relative(repositoryRoot, source)
        return !relativeSource.startsWith("node_modules") && !relativeSource.startsWith(".git")
      },
    })
    await mutate(copiedRoot)
    return await check(copiedRoot)
  } finally {
    await rm(temporaryParent, { recursive: true, force: true })
  }
}

export async function appendToFile(root: string, path: string, text: string): Promise<void> {
  const filePath = join(root, path)
  const contents = await readFile(filePath, "utf8")
  await writeFile(filePath, `${contents}${text}`, "utf8")
}

export async function replaceInFile(
  root: string,
  path: string,
  search: string,
  replacement: string,
): Promise<void> {
  const filePath = join(root, path)
  const contents = await readFile(filePath, "utf8")
  await writeFile(filePath, contents.replace(search, replacement), "utf8")
}

export async function removeFile(root: string, path: string): Promise<void> {
  await unlink(join(root, path))
}

export async function createOutsideFile(root: string, path: string): Promise<void> {
  await writeFile(join(dirname(root), path), "outside root fixture\n", "utf8")
}

export async function createSymlink(root: string, path: string, target: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await symlink(target, join(root, path))
}

export async function createFile(root: string, path: string, contents: string): Promise<void> {
  const filePath = join(root, path)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, "utf8")
}

export async function createDirectoryEntries(
  root: string,
  directory: string,
  count: number,
): Promise<void> {
  const directoryPath = join(root, directory)
  await mkdir(directoryPath, { recursive: true })
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      writeFile(
        join(directoryPath, `entry-${index.toString().padStart(5, "0")}.txt`),
        "entry\n",
        "utf8",
      ),
    ),
  )
}

export async function createDirectoryTree(root: string, levels: readonly number[]): Promise<void> {
  const createLevel = async (parent: string, level: number): Promise<void> => {
    const width = levels[level]
    if (width === undefined) return
    await Promise.all(
      Array.from({ length: width }, async (_, index) => {
        const directory = join(parent, `directory-${level}-${index.toString().padStart(4, "0")}`)
        await mkdir(directory, { recursive: true })
        await createLevel(directory, level + 1)
      }),
    )
  }
  await createLevel(join(root, "directory-tree"), 0)
}

export function runCommand(command: ReleaseCommand, root: string): ReleaseCheckResult {
  return runReleaseCheck(
    [command, "--root", root, "--plan", ".omo/plans/waha-command-center.md"],
    repositoryRoot,
  )
}
