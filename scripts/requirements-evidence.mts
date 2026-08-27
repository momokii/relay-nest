import { GUARDRAIL_EVIDENCE } from "./requirements-guardrails.mts"

export type Marker = {
  readonly path: string
  readonly text: string
}

export type EvidenceManifest = {
  readonly implementationFiles: readonly string[]
  readonly testFiles: readonly string[]
  readonly referenceFiles: readonly string[]
  readonly markers: readonly Marker[]
  readonly negativeTestMarkers?: readonly string[]
}

export const REQUIREMENT_EVIDENCE: Readonly<Record<string, EvidenceManifest>> = {
  "a-single-tenant": {
    implementationFiles: ["apps/api/src/app.ts"],
    testFiles: ["tests/task-14-dashboard-model.test.ts"],
    referenceFiles: ["docs/threat-model.md"],
    markers: [
      { path: "apps/api/src/app.ts", text: "createApiApp" },
      { path: "tests/task-14-dashboard-model.test.ts", text: "Personal and Business" },
      { path: "docs/threat-model.md", text: "single-tenant" },
    ],
  },
  "official-waha-openapi": {
    implementationFiles: ["docs/waha-capability-matrix.md"],
    testFiles: ["tests/waha-adapter.test.ts"],
    referenceFiles: ["docs/waha-capability-matrix.md"],
    markers: [
      { path: "docs/waha-capability-matrix.md", text: "OpenAPI" },
      { path: "tests/waha-adapter.test.ts", text: "matrix paths" },
    ],
  },
  "typescript-modular-monolith": {
    implementationFiles: ["package.json", "tsconfig.json"],
    testFiles: ["tests/workspace-smoke.test.ts"],
    referenceFiles: ["README.md"],
    markers: [
      { path: "package.json", text: "pnpm" },
      { path: "tsconfig.json", text: '"strict": true' },
      { path: "tests/workspace-smoke.test.ts", text: "workspace" },
    ],
  },
  "admin-operator-viewer": {
    implementationFiles: ["apps/api/src/auth/authorization.ts"],
    testFiles: ["tests/authz.test.ts"],
    referenceFiles: ["docs/decisions/0001-product-boundary.md"],
    markers: [
      { path: "apps/api/src/auth/authorization.ts", text: "USER_ROLES" },
      { path: "tests/authz.test.ts", text: "grant" },
      { path: "docs/decisions/0001-product-boundary.md", text: "Admin creates" },
    ],
  },
  "runtime-waha-connection": {
    implementationFiles: ["apps/api/src/waha/config.ts"],
    testFiles: ["tests/waha-adapter.test.ts"],
    referenceFiles: ["docs/threat-model.md"],
    markers: [
      { path: "apps/api/src/waha/config.ts", text: "createWahaRuntimeSettingsService" },
      { path: "tests/waha-adapter.test.ts", text: "server-only" },
      { path: "docs/threat-model.md", text: "server-side" },
    ],
  },
  "docker-compose-dashboard-only": {
    implementationFiles: ["docker-compose.yml", "docker-compose.external-waha.yml"],
    testFiles: ["tests/compose-startup.test.ts"],
    referenceFiles: ["docs/operations.md"],
    markers: [
      { path: "docker-compose.yml", text: "services:" },
      { path: "tests/compose-startup.test.ts", text: "non-root" },
      { path: "docs/operations.md", text: "external mode" },
    ],
  },
  "session-list-status": {
    implementationFiles: ["apps/api/src/waha/sessions.ts"],
    testFiles: ["tests/waha-session.test.ts"],
    referenceFiles: ["docs/waha-capability-matrix.md"],
    markers: [
      { path: "apps/api/src/waha/sessions.ts", text: "session" },
      { path: "tests/waha-session.test.ts", text: "scoped WAHA" },
      { path: "docs/waha-capability-matrix.md", text: "sessions" },
    ],
  },
  "immediate-and-durable": {
    implementationFiles: ["apps/api/src/messaging.ts", "apps/api/src/scheduler/types.ts"],
    testFiles: ["tests/messaging.test.ts", "tests/scheduler.test.ts"],
    referenceFiles: ["CONTEXT.md"],
    markers: [
      { path: "apps/api/src/messaging.ts", text: "idempotency" },
      { path: "tests/messaging.test.ts", text: "idempotent" },
      { path: "tests/scheduler.test.ts", text: "durable one-time" },
      { path: "CONTEXT.md", text: "one-time" },
    ],
  },
  "hmac-validated-idempotent": {
    implementationFiles: ["apps/api/src/waha/webhook.ts"],
    testFiles: ["tests/waha-webhook.test.ts"],
    referenceFiles: ["docs/waha-capability-matrix.md"],
    markers: [
      { path: "apps/api/src/waha/webhook.ts", text: "SignedWebhookRequest" },
      { path: "tests/waha-webhook.test.ts", text: "HMAC" },
      { path: "docs/waha-capability-matrix.md", text: "webhooks" },
    ],
  },
  "application-level-encryption": {
    implementationFiles: ["apps/api/src/backup/format.ts", "packages/config/src/encryption.ts"],
    testFiles: ["tests/encryption.test.ts", "tests/task-12-backup.test.ts"],
    referenceFiles: ["docs/threat-model.md"],
    markers: [
      { path: "apps/api/src/backup/format.ts", text: "decrypt" },
      { path: "tests/encryption.test.ts", text: "authenticated" },
      { path: "docs/threat-model.md", text: "encrypted" },
    ],
  },
  "optional-smtp-and-telegram": {
    implementationFiles: ["apps/api/src/notifications/service.ts"],
    testFiles: ["tests/task-11-notifications.test.ts"],
    referenceFiles: ["docs/decisions/0001-product-boundary.md"],
    markers: [
      { path: "apps/api/src/notifications/service.ts", text: "sendTelegram" },
      { path: "tests/task-11-notifications.test.ts", text: "disabled channel" },
      { path: "docs/decisions/0001-product-boundary.md", text: "Email/SMTP" },
    ],
  },
  "human-approved-provider-agnostic": {
    implementationFiles: [
      "apps/api/src/ai/service.ts",
      "apps/web/src/components/ai-review-panel.tsx",
    ],
    testFiles: ["tests/task-14-ai-approval-contract.integration.test.ts"],
    referenceFiles: ["docs/decisions/0001-product-boundary.md"],
    markers: [
      { path: "apps/api/src/ai/service.ts", text: "sendState" },
      { path: "tests/task-14-ai-approval-contract.integration.test.ts", text: "not_sent" },
      { path: "docs/decisions/0001-product-boundary.md", text: "human approval" },
    ],
  },
  "readme-architecture-setup-deployment": {
    implementationFiles: ["README.md"],
    testFiles: ["tests/release-docs-structure.test.ts"],
    referenceFiles: ["docs/operations.md", ".claude/state/CURRENT_STATUS.md"],
    markers: [
      { path: "README.md", text: "Source of truth" },
      { path: "tests/release-docs-structure.test.ts", text: "documentation" },
      { path: "docs/operations.md", text: "Operations Runbook" },
      { path: ".claude/state/CURRENT_STATUS.md", text: "Verification snapshot" },
    ],
  },
  ...GUARDRAIL_EVIDENCE,
}

export function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
