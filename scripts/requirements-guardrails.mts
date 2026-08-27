type Marker = {
  readonly path: string
  readonly text: string
}

type EvidenceManifest = {
  readonly implementationFiles: readonly string[]
  readonly testFiles: readonly string[]
  readonly referenceFiles: readonly string[]
  readonly markers: readonly Marker[]
  readonly negativeTestMarkers: readonly string[]
}

export const GUARDRAIL_EVIDENCE: Readonly<Record<string, EvidenceManifest>> = {
  "do-not-build-multi-tenant": {
    implementationFiles: ["docs/decisions/0001-product-boundary.md"],
    testFiles: ["tests/task-14-dashboard-model.test.ts", "tests/authz.test.ts"],
    referenceFiles: ["README.md"],
    markers: [
      { path: "docs/decisions/0001-product-boundary.md", text: "multi-tenant" },
      { path: "tests/task-14-dashboard-model.test.ts", text: "scope" },
      { path: "README.md", text: "multi-tenant SaaS" },
    ],
    negativeTestMarkers: ['reason: "scope_denied"'],
  },
  "do-not-expose-the-waha-api": {
    implementationFiles: ["apps/web/src/components/admin-pages.tsx"],
    testFiles: ["tests/waha-adapter.test.ts"],
    referenceFiles: [".claude/SECURITY_STANDARDS.md"],
    markers: [
      { path: "apps/web/src/components/admin-pages.tsx", text: "WAHA credentials" },
      { path: "tests/waha-adapter.test.ts", text: "server-only" },
      { path: ".claude/SECURITY_STANDARDS.md", text: "browser" },
    ],
    negativeTestMarkers: ['not.toContain("redact")'],
  },
  "do-not-make-working-equal": {
    implementationFiles: ["apps/api/src/scheduler/types.ts"],
    testFiles: ["tests/scheduler.test.ts"],
    referenceFiles: ["docs/threat-model.md"],
    markers: [
      { path: "apps/api/src/scheduler/types.ts", text: "acknowledged" },
      { path: "tests/scheduler.test.ts", text: "unknown" },
      { path: "docs/threat-model.md", text: "delivery" },
    ],
    negativeTestMarkers: ['state: "unknown"'],
  },
  "do-not-implement-media": {
    implementationFiles: ["apps/web/src/components/message-composer.tsx"],
    testFiles: ["tests/task-14-dashboard-model.test.ts"],
    referenceFiles: ["CONTEXT.md"],
    markers: [
      { path: "apps/web/src/components/message-composer.tsx", text: "no media" },
      { path: "tests/task-14-dashboard-model.test.ts", text: "media" },
      { path: "CONTEXT.md", text: "outside the MVP" },
    ],
    negativeTestMarkers: ["media and recurrence are unavailable"],
  },
  "do-not-add-redis": {
    implementationFiles: ["apps/api/src/scheduler/database.ts"],
    testFiles: ["tests/scheduler.test.ts"],
    referenceFiles: ["docs/decisions/0001-product-boundary.md"],
    markers: [
      { path: "apps/api/src/scheduler/database.ts", text: "claimDue" },
      { path: "tests/scheduler.test.ts", text: "worker" },
      { path: "docs/decisions/0001-product-boundary.md", text: "Redis" },
    ],
    negativeTestMarkers: ["dispatches a due job once when two workers claim concurrently"],
  },
  "do-not-persist-plaintext": {
    implementationFiles: ["packages/config/src/encryption.ts"],
    testFiles: ["tests/encryption.test.ts"],
    referenceFiles: [".claude/SECURITY_STANDARDS.md"],
    markers: [
      { path: "packages/config/src/encryption.ts", text: "plaintext" },
      { path: "tests/encryption.test.ts", text: "plaintext" },
      { path: ".claude/SECURITY_STANDARDS.md", text: "Never hardcode secrets" },
    ],
    negativeTestMarkers: ['not.toContain("opaque-fixture-1")'],
  },
  "do-not-use-unbounded": {
    implementationFiles: ["apps/api/src/notifications/service.ts"],
    testFiles: ["tests/task-11-notifications.test.ts"],
    referenceFiles: ["docs/threat-model.md"],
    markers: [
      { path: "apps/api/src/notifications/service.ts", text: "retry" },
      { path: "tests/task-11-notifications.test.ts", text: "unbounded retry" },
      { path: "docs/threat-model.md", text: "No unbounded retry" },
    ],
    negativeTestMarkers: ["expect(retryDelayMs(99)).toBe(2000)"],
  },
  "do-not-silently-purge": {
    implementationFiles: ["apps/api/src/retention/service.ts"],
    testFiles: ["tests/task-12-retention.integration.test.ts"],
    referenceFiles: ["docs/operations.md"],
    markers: [
      { path: "apps/api/src/retention/service.ts", text: "confirmation" },
      { path: "tests/task-12-retention.integration.test.ts", text: "non-destructive" },
      { path: "docs/operations.md", text: "purge" },
    ],
    negativeTestMarkers: ["policy edits non-destructive"],
  },
  "do-not-use-unpinned": {
    implementationFiles: ["docker-compose.yml"],
    testFiles: ["tests/compose-startup.test.ts"],
    referenceFiles: ["docs/operations.md"],
    markers: [
      { path: "docker-compose.yml", text: "image:" },
      { path: "tests/compose-startup.test.ts", text: "immutable references" },
      { path: "docs/operations.md", text: "Compose" },
    ],
    negativeTestMarkers: ["uses tested immutable references"],
  },
}
