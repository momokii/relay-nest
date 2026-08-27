export type RequiredDocument = {
  readonly path: string
  readonly markers: readonly string[]
}

export const REQUIRED_DOCUMENTS: readonly RequiredDocument[] = [
  {
    path: "README.md",
    markers: [
      "Source of truth",
      "external-WAHA and bundled-WAHA Compose",
      "WAHA credentials stay server-side",
      "Copy `.env.example`",
      "Restriction or ban",
    ],
  },
  { path: "CONTEXT.md", markers: ["Personal and Business scopes are never interchangeable."] },
  {
    path: "docs/operations.md",
    markers: [
      "Compose deployment modes",
      "files are visible in the command",
      "ENCRYPTION_MASTER_KEY_FILE",
      "POSTGRES_PASSWORD_FILE",
      "Startup, health, and readiness",
      "project-scoped",
      "reverse proxy terminating HTTPS/TLS",
      "unofficial reverse-engineered WhatsApp client",
      "devlikeapro/waha:2026.8.1",
      "no registry manifest",
      "configuration-only until the image is available",
      "fail-closed blocker",
      "no supported secret-file mechanism",
    ],
  },
  {
    path: "docs/threat-model.md",
    markers: [
      "Dashboard exposure",
      "WAHA credentials",
      "Unofficial-client ban risk",
      "Public deployment requires a reverse proxy with HTTPS/TLS",
    ],
  },
  {
    path: "docs/waha-capability-matrix.md",
    markers: ["Native dashboard floor", "Capability matrix"],
  },
  {
    path: "docs/decisions/0001-product-boundary.md",
    markers: ["Product and access boundary", "Network boundary"],
  },
  { path: ".claude/README.md", markers: ["Security baseline", "state/CURRENT_STATUS.md"] },
  { path: ".claude/state/CURRENT_STATUS.md", markers: ["Verification snapshot"] },
  { path: ".claude/state/TASK_QUEUE.md", markers: ["Remaining queue"] },
  { path: ".claude/state/DECISIONS_LOG.md", markers: ["Decision"] },
  { path: ".omo/plans/waha-command-center.md", markers: ["## Scope", "## Todos"] },
  {
    path: ".omo/plans/relaynest-next-phases.md",
    markers: [
      "# relaynest-next-phases - Work Plan",
      "## Scope",
      "- [ ] 8. Resolve or evidence the bundled-WAHA image prerequisite",
      "- [ ] 9. Add repository-local release verification commands",
    ],
  },
  {
    path: ".omo/plans/waha-command-center.md",
    markers: [
      "## Scope",
      "## Todos",
      "- [ ] 15. Complete Docker Compose deployment modes and operational documentation",
      "- [ ] 16. Run recursive security, requirement, and release-readiness verification",
    ],
  },
  {
    path: ".omo/evidence/task-15-next-phases-operations.md",
    markers: [
      "## Bundled checks and blockers",
      "exact image availability checks failed",
      "Bundled runtime remains blocked",
      "unsupported secret boundary",
    ],
  },
  {
    path: ".omo/evidence/task-15-next-phases-bundled.md",
    markers: [
      "devlikeapro/waha:2026.8.1",
      "BLOCKED — Todo 15 Slice 8 remains open.",
      "exact image reference",
      "supported secret boundary prerequisite is not available",
      "Therefore no bundled health",
      "runtime acceptance remains blocked",
    ],
  },
] as const

export const STALE_CLAIMS = [
  /Release status:\s*complete and fully verified\./i,
  /\bBundled\s+WAHA\s+is\s+available\b/i,
  /\bBundled\s+(?:WAHA\s+)?(?:runtime|mode)\s+is\s+(?:now\s+)?available\b/i,
  /\b(?:Todo|Task)\s+1[56]\s+is\s+(?:now\s+)?complete(?:d)?\b/i,
  /\bEvery\s+final\s+gate\s+is\s+green\b/i,
  /\bAll\s+final\s+gates?\s+(?:pass|passed|are\s+pass(?:ed)?|is\s+pass(?:ed)?)\b/i,
  /\bRelease\s+readiness\s*:\s*PASS\b/i,
  /\bNo\s+release\s+blockers\s+remain\b/i,
  /\bAll\s+(?:release\s+)?checks?\s+(?:are|were|have been|passed|green|complete(?:d)?)\b/i,
  /\bbundled\s+(?:WAHA|mode|runtime)\b\s+(?:runtime\s+)?(?:is|remains)\s+(?:now\s+)?(?:verified|runnable|healthy|ready|operational|working)\b/i,
  /\b(?:(?:all|every)\s+(?:release|final)(?:\s+\w+){0,2}|final(?:\s+\w+){0,2})\s+gates?\s+(?:(?:are|were|have been)\s+)?(?:now\s+)?(?:complete|completed|passed|verified|green)(?:\s+(?:and|&)\s+(?:complete|completed|passed|verified|green))*\s*(?=[.!?\n]|$)/i,
] as const

export const MARKDOWN_LINK = /!?(?:\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g
export const EXTERNAL_LINK = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i
