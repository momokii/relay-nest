import { spawnSync } from "node:child_process"
import { existsSync, realpathSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"

export type FeatureOptions = {
  readonly testFile: string
  readonly testName: string
  readonly paths: readonly string[]
}

export type FeatureCommand = {
  readonly name: "vitest" | "typecheck" | "biome"
  readonly args: readonly string[]
}

export type FeatureParseResult =
  | { readonly ok: true; readonly options: FeatureOptions }
  | { readonly ok: false; readonly exitCode: 2; readonly message: string }

const USAGE =
  "usage: pnpm feature --test-file tests/<regression>.test.ts --test-name <name> --paths <changed-file> [...paths]"

function invalid(message: string): FeatureParseResult {
  return { ok: false, exitCode: 2, message: `${message}\n${USAGE}` }
}

function canonicalPath(root: string, candidate: string): string | null {
  const absolute = resolve(root, candidate)
  const relativePath = relative(root, absolute)
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) return null
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return null

  const canonical = realpathSync(absolute)
  const canonicalRelative = relative(root, canonical)
  if (
    canonicalRelative === "" ||
    canonicalRelative.startsWith("..") ||
    isAbsolute(canonicalRelative)
  )
    return null
  return canonical
}

function parseOptionValue(argv: readonly string[], index: number): string | null {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) return null
  return value
}

export function parseFeatureArguments(argv: readonly string[], cwd: string): FeatureParseResult {
  let testFile: string | undefined
  let testName: string | undefined
  const paths: string[] = []
  let pathsStarted = false

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === "--test-file") {
      if (testFile !== undefined) return invalid("--test-file may be provided only once")
      const value = parseOptionValue(argv, index)
      if (value === null) return invalid("--test-file requires a file")
      testFile = value
      index += 1
      continue
    }
    if (option === "--test-name") {
      if (testName !== undefined) return invalid("--test-name may be provided only once")
      const value = parseOptionValue(argv, index)
      if (value === null || value.trim().length === 0)
        return invalid("--test-name requires a value")
      testName = value
      index += 1
      continue
    }
    if (option === "--paths") {
      if (pathsStarted) return invalid("--paths may be provided only once")
      pathsStarted = true
      while (index + 1 < argv.length && !argv[index + 1]?.startsWith("--")) {
        const value = argv[index + 1]
        if (value === undefined) break
        paths.push(value)
        index += 1
      }
      continue
    }
    return invalid(`unknown option: ${option ?? "<missing>"}`)
  }

  if (testFile === undefined) return invalid("--test-file is required")
  if (testName === undefined) return invalid("--test-name is required")
  if (!pathsStarted || paths.length === 0) return invalid("--paths requires at least one file")

  const canonicalTestFile = canonicalPath(cwd, testFile)
  if (
    canonicalTestFile === null ||
    relative(cwd, canonicalTestFile).split(sep)[0] !== "tests" ||
    !/(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(testFile)
  )
    return invalid("--test-file must be an existing repository test file")

  const canonicalPaths: string[] = []
  for (const path of paths) {
    const canonical = canonicalPath(cwd, path)
    if (canonical === null) return invalid(`--paths contains an invalid repository file: ${path}`)
    canonicalPaths.push(canonical)
  }

  return {
    ok: true,
    options: { testFile: canonicalTestFile, testName, paths: canonicalPaths },
  }
}

export function buildFeatureCommandPlan(
  options: FeatureOptions,
  cwd = process.cwd(),
): FeatureCommand[] {
  const toRelative = (path: string): string => relative(cwd, path)
  return [
    {
      name: "vitest",
      args: [
        "--yes",
        "pnpm@10.12.4",
        "exec",
        "vitest",
        "run",
        "--pool=forks",
        "--maxWorkers=1",
        "--minWorkers=1",
        toRelative(options.testFile),
        "-t",
        options.testName,
      ],
    },
    { name: "typecheck", args: ["--yes", "pnpm@10.12.4", "run", "typecheck"] },
    {
      name: "biome",
      args: ["--yes", "pnpm@10.12.4", "exec", "biome", "check", ...options.paths.map(toRelative)],
    },
  ]
}

function run(command: FeatureCommand, cwd: string): number {
  const result = spawnSync("npx", command.args, { cwd, stdio: "inherit" })
  if (result.error !== undefined) {
    console.error(`feature check could not start ${command.name}: ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

export function main(argv: readonly string[] = process.argv.slice(2), cwd = process.cwd()): number {
  const parsed = parseFeatureArguments(argv, cwd)
  if (!parsed.ok) {
    console.error(parsed.message)
    return parsed.exitCode
  }

  for (const command of buildFeatureCommandPlan(parsed.options, cwd)) {
    const status = run(command, cwd)
    if (status !== 0) return status
  }
  return 0
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))
) {
  process.exitCode = main()
}
