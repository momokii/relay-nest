import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { checkDocumentation } from "./release-docs-check.mts"
import { checkScope } from "./release-scope.mts"
import { checkRequirements } from "./requirements-checker.mts"
import { checkSecrets } from "./secret-checker.mts"

export const RELEASE_COMMANDS = ["requirements", "secrets", "scope", "docs"] as const
export type ReleaseCommand = (typeof RELEASE_COMMANDS)[number]

export const RELEASE_EXIT_CODES = {
  pass: 0,
  validationFailure: 1,
  invalidInput: 2,
} as const
export type ReleaseExitCode = (typeof RELEASE_EXIT_CODES)[keyof typeof RELEASE_EXIT_CODES]

export type ReleaseOptions = {
  readonly root: string
  readonly plan: string
}

export type ReleaseDiagnostic = {
  readonly path: string
  readonly line: number
  readonly rule: string
  readonly remediation: string
}

export type ReleaseCheckResult = {
  readonly command: ReleaseCommand | null
  readonly options: ReleaseOptions | null
  readonly exitCode: ReleaseExitCode
  readonly diagnostics: readonly ReleaseDiagnostic[]
}

type ParsedArguments =
  | { readonly ok: true; readonly command: ReleaseCommand; readonly options: ReleaseOptions }
  | { readonly ok: false; readonly diagnostics: readonly ReleaseDiagnostic[] }

const DEFAULT_PLAN = ".omo/plans/waha-command-center.md"
const CLI_PATH = "<cli>"

function invalidInput(remediation: string): ReleaseDiagnostic {
  return { path: CLI_PATH, line: 0, rule: "invalid-input", remediation }
}

function isReleaseCommand(value: string | undefined): value is ReleaseCommand {
  return value !== undefined && RELEASE_COMMANDS.some((command) => command === value)
}

export function parseReleaseArguments(argv: readonly string[], cwd: string): ParsedArguments {
  const [command, ...rest] = argv
  if (!isReleaseCommand(command)) {
    return {
      ok: false,
      diagnostics: [invalidInput("use one of: requirements, secrets, scope, docs")],
    }
  }

  let root = cwd
  let plan = DEFAULT_PLAN
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index]
    const value = rest[index + 1]
    if ((option === "--root" || option === "--plan") && value !== undefined) {
      if (option === "--root") root = resolve(cwd, value)
      if (option === "--plan") plan = value
      index += 1
      continue
    }
    return { ok: false, diagnostics: [invalidInput("use --root <path> and --plan <path>")] }
  }

  return { ok: true, command, options: { root, plan } }
}

export function dispatchReleaseCheck(
  command: ReleaseCommand,
  options: ReleaseOptions,
): ReleaseCheckResult {
  switch (command) {
    case "requirements": {
      const diagnostics = checkRequirements(options)
      return {
        command,
        options,
        exitCode:
          diagnostics.length === 0 ? RELEASE_EXIT_CODES.pass : RELEASE_EXIT_CODES.validationFailure,
        diagnostics,
      }
    }
    case "secrets": {
      const diagnostics = checkSecrets(options)
      return {
        command,
        options,
        exitCode:
          diagnostics.length === 0 ? RELEASE_EXIT_CODES.pass : RELEASE_EXIT_CODES.validationFailure,
        diagnostics,
      }
    }
    case "scope": {
      const diagnostics = checkScope(options)
      return {
        command,
        options,
        exitCode:
          diagnostics.length === 0 ? RELEASE_EXIT_CODES.pass : RELEASE_EXIT_CODES.validationFailure,
        diagnostics,
      }
    }
    case "docs": {
      const diagnostics = checkDocumentation(options)
      return {
        command,
        options,
        exitCode:
          diagnostics.length === 0 ? RELEASE_EXIT_CODES.pass : RELEASE_EXIT_CODES.validationFailure,
        diagnostics,
      }
    }
    default:
      return assertNever(command)
  }
}

export function runReleaseCheck(argv: readonly string[], cwd = process.cwd()): ReleaseCheckResult {
  const parsed = parseReleaseArguments(argv, cwd)
  if (!parsed.ok) {
    return {
      command: null,
      options: null,
      exitCode: RELEASE_EXIT_CODES.invalidInput,
      diagnostics: parsed.diagnostics,
    }
  }
  return dispatchReleaseCheck(parsed.command, parsed.options)
}

export function formatReleaseDiagnostic(diagnostic: ReleaseDiagnostic): string {
  return `${diagnostic.path}:${diagnostic.line} ${diagnostic.rule} ${diagnostic.remediation}`
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const result = runReleaseCheck(argv)
  for (const diagnostic of result.diagnostics) {
    console.error(formatReleaseDiagnostic(diagnostic))
  }
  return result.exitCode
}

function assertNever(value: never): never {
  throw new Error(`unreachable release command: ${String(value)}`)
}

const modulePath = fileURLToPath(import.meta.url)
const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === modulePath) {
  process.exitCode = main()
}
