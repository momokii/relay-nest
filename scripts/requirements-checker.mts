import { isAbsolute, relative, resolve, sep } from "node:path"

import type { ReleaseDiagnostic, ReleaseOptions } from "./release-checks.mts"
import {
  type BoundedReadResult,
  type BoundedReadState,
  createBoundedReadState,
  readBoundedFile,
} from "./release-fs.mts"
import { containsSemanticMarker } from "./release-source-text.mts"
import {
  type EvidenceManifest,
  fingerprint,
  REQUIREMENT_EVIDENCE,
} from "./requirements-evidence.mts"

type PlanRequirement = {
  readonly kind: "must-have" | "must-not-have"
  readonly line: number
  readonly text: string
}

type ParsedPlan = {
  readonly requirements: readonly PlanRequirement[]
  readonly validSections: boolean
}

const MUST_HAVE_HEADING = "### Must have"
const MUST_NOT_HAVE_HEADING = "### Must NOT have (guardrails, anti-slop, scope boundaries)"

function parseRequirements(plan: string): ParsedPlan {
  const requirements: PlanRequirement[] = []
  let kind: PlanRequirement["kind"] | null = null
  let mustHaveSections = 0
  let mustNotHaveSections = 0
  let mustHaveBullets = 0
  let mustNotHaveBullets = 0
  for (const [index, rawLine] of plan.split("\n").entries()) {
    const line = rawLine.trim()
    if (line === MUST_HAVE_HEADING) {
      kind = "must-have"
      mustHaveSections += 1
      continue
    }
    if (line === MUST_NOT_HAVE_HEADING) {
      kind = "must-not-have"
      mustNotHaveSections += 1
      continue
    }
    if (line.startsWith("## ")) {
      kind = null
      continue
    }
    if (line.startsWith("### ")) {
      kind = null
      continue
    }
    if (kind !== null && line.startsWith("- ")) {
      requirements.push({ kind, line: index + 1, text: line.slice(2).trim() })
      if (kind === "must-have") mustHaveBullets += 1
      else mustNotHaveBullets += 1
    }
  }
  return {
    requirements,
    validSections:
      mustHaveSections === 1 &&
      mustNotHaveSections === 1 &&
      mustHaveBullets > 0 &&
      mustNotHaveBullets > 0,
  }
}

function relativePath(root: string, path: string): string {
  return relative(root, resolve(root, path))
}

function fileDiagnostic(path: string): ReleaseDiagnostic {
  return {
    path,
    line: 0,
    rule: "requirements-file-missing",
    remediation: "restore the mapped implementation, test, or reference file",
  }
}

function markerDiagnostic(path: string): ReleaseDiagnostic {
  return {
    path,
    line: 0,
    rule: "requirements-marker-missing",
    remediation: "restore the declared evidence marker or update the approved manifest",
  }
}

function planBoundaryDiagnostic(): ReleaseDiagnostic {
  return {
    path: "<plan>",
    line: 0,
    rule: "requirements-plan-boundary",
    remediation: "provide a relative plan path contained within --root",
  }
}

function isContainedPlan(root: string, plan: string): boolean {
  if (isAbsolute(plan) || plan.split(/[\\/]+/).some((part) => part === "..")) return false
  const resolvedRoot = resolve(root)
  const resolvedPlan = resolve(resolvedRoot, plan)
  const relativePlan = relative(resolvedRoot, resolvedPlan)
  return relativePlan !== ".." && !relativePlan.startsWith(`..${sep}`) && !isAbsolute(relativePlan)
}

function requirementsSectionDiagnostic(): ReleaseDiagnostic {
  return {
    path: "<plan>",
    line: 0,
    rule: "requirements-section-invalid",
    remediation: "provide exactly one non-empty canonical Must-have and Must-NOT-have section",
  }
}

function requirementsReadDiagnostic(): ReleaseDiagnostic {
  return {
    path: "<root>",
    line: 0,
    rule: "requirements-file-read",
    remediation: "provide readable regular plan and evidence files within --root",
  }
}

function readEvidenceFile(root: string, path: string, state: BoundedReadState): BoundedReadResult {
  return readBoundedFile(root, path, state)
}

type EvidenceCheckOptions = {
  readonly root: string
  readonly evidence: EvidenceManifest
  readonly state: BoundedReadState
  readonly requiresNegativeEvidence: boolean
}

function checkEvidence(options: EvidenceCheckOptions): readonly ReleaseDiagnostic[] {
  const { root, evidence, state, requiresNegativeEvidence } = options
  const diagnostics: ReleaseDiagnostic[] = []
  const files = [...evidence.implementationFiles, ...evidence.testFiles, ...evidence.referenceFiles]
  const contents = new Map<string, string>()
  for (const path of files) {
    const result = readEvidenceFile(root, path, state)
    if (result.kind === "missing") diagnostics.push(fileDiagnostic(path))
    else if (result.kind !== "complete") diagnostics.push(requirementsReadDiagnostic())
    else contents.set(path, result.contents)
  }
  for (const marker of evidence.markers) {
    const fileContents = contents.get(marker.path)
    if (fileContents === undefined || !fileContents.includes(marker.text)) {
      diagnostics.push(markerDiagnostic(marker.path))
    }
  }
  if (requiresNegativeEvidence) {
    const negativeMarkers = evidence.negativeTestMarkers ?? []
    if (negativeMarkers.length === 0) {
      diagnostics.push({
        path: "<plan>",
        line: 0,
        rule: "requirements-negative-evidence-missing",
        remediation: "declare semantic negative assertion markers for every Must-NOT requirement",
      })
    }
    for (const marker of negativeMarkers) {
      if (
        !evidence.testFiles.some((path) => {
          const fileContents = contents.get(path)
          return fileContents !== undefined && containsSemanticMarker(fileContents, marker)
        })
      ) {
        diagnostics.push({
          path: "<plan>",
          line: 0,
          rule: "requirements-negative-evidence-missing",
          remediation: "restore the declared semantic negative assertion in its test file",
        })
      }
    }
  }
  return diagnostics
}

export function checkRequirements(options: ReleaseOptions): readonly ReleaseDiagnostic[] {
  if (!isContainedPlan(options.root, options.plan)) return [planBoundaryDiagnostic()]
  const state = createBoundedReadState()
  const planResult = readBoundedFile(options.root, options.plan, state)
  if (planResult.kind === "missing") {
    return [
      {
        path: relativePath(options.root, options.plan),
        line: 0,
        rule: "requirements-file-missing",
        remediation: "provide the approved plan file for requirements verification",
      },
    ]
  }
  if (planResult.kind !== "complete") return [requirementsReadDiagnostic()]
  const parsed = parseRequirements(planResult.contents)
  if (!parsed.validSections) return [requirementsSectionDiagnostic()]
  const diagnostics: ReleaseDiagnostic[] = []
  const matchedKeys = new Set<string>()
  for (const requirement of parsed.requirements) {
    const key = Object.keys(REQUIREMENT_EVIDENCE).find((prefix) =>
      fingerprint(requirement.text).startsWith(prefix),
    )
    if (key === undefined) {
      diagnostics.push({
        path: relativePath(options.root, options.plan),
        line: requirement.line,
        rule:
          requirement.kind === "must-have" ? "requirements-unresolved" : "requirements-unmapped",
        remediation: "map this plan bullet to implementation, tests, references, and markers",
      })
      continue
    }
    matchedKeys.add(key)
    const evidence = REQUIREMENT_EVIDENCE[key]
    if (evidence !== undefined) {
      diagnostics.push(
        ...checkEvidence({
          root: options.root,
          evidence,
          state,
          requiresNegativeEvidence: requirement.kind === "must-not-have",
        }),
      )
    }
  }
  for (const key of Object.keys(REQUIREMENT_EVIDENCE)) {
    if (!matchedKeys.has(key)) {
      diagnostics.push({
        path: relativePath(options.root, options.plan),
        line: 0,
        rule: "requirements-mapped-missing",
        remediation: "restore every expected mapped requirement bullet in the approved plan",
      })
    }
  }
  return diagnostics
}
