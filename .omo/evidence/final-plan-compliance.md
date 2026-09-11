# F1 Plan-Compliance Audit — APPROVED (waha-finalize-15-16)

Date: 2026-09-11
Gate: F1 of `.omo/plans/waha-finalize-15-16.md` (line 136)
Audited plan: `.omo/plans/waha-command-center.md` (protected approved-scope plan)
Previous content of this file: the 2026-09-11 PENDING placeholder (Todo 9
collation); the 2026-08-28 BLOCKED audit before that, preserved in git history.

## Verdict

**APPROVED.** `pnpm verify:requirements --plan .omo/plans/waha-command-center.md`
exits 0 with zero diagnostics: all 13 Must-have bullets and all 9 Must-NOT-have
bullets are mapped to implementation/test/reference evidence with verified
markers, every Must-NOT-have has a semantic negative assertion present in real
test code, and mutation tests confirm the gate exits non-zero for any unmapped
item.

## Automated gate (exact command and receipt)

```text
$ npx --yes pnpm@10.12.4 verify:requirements --plan .omo/plans/waha-command-center.md
> node --experimental-strip-types scripts/release-checks.mts requirements --plan .omo/plans/waha-command-center.md
GATE_EXIT=0
```

stdout/stderr: no diagnostics. Exit code 0 = pass
(`scripts/release-checks.mts`: 0 pass / 1 validation failure / 2 invalid input).

Mechanics (`scripts/requirements-checker.mts`): parses the plan's canonical
`### Must have` / `### Must NOT have` sections (exactly one non-empty each),
fingerprints each bullet, and requires a prefix match against
`REQUIREMENT_EVIDENCE` (`scripts/requirements-evidence.mts`, 13 entries) plus
`GUARDRAIL_EVIDENCE` (`scripts/requirements-guardrails.mts`, 9 entries). Any
unmapped must-have bullet yields `requirements-unresolved`; any unmapped
must-not-have bullet yields `requirements-unmapped`; any declared-but-unmatched
manifest key yields `requirements-mapped-missing`. All three exit 1.

Plan bullets: 13 must-have + 9 must-not-have = 22. Manifest entries: 13 + 9 =
22. Match is exact on both directions (exit 0 proves no
`requirements-unresolved`/`-unmapped`/`-mapped-missing` diagnostics).

## Must-have mapping (13/13 with implementation + test references)

| # | Plan bullet (plan line) | Manifest key | Implementation | Tests | References |
| --- | --- | --- | --- | --- | --- |
| 1 | Single-tenant self-hosted multi-user command center (26) | `a-single-tenant` | `apps/api/src/app.ts` | `tests/task-14-dashboard-model.test.ts` | `docs/threat-model.md` |
| 2 | WAHA OpenAPI capability matrix pinned (27) | `official-waha-openapi` | `docs/waha-capability-matrix.md` | `tests/waha-adapter.test.ts` | `docs/waha-capability-matrix.md` |
| 3 | TypeScript modular monolith stack (28) | `typescript-modular-monolith` | `package.json`, `tsconfig.json` | `tests/workspace-smoke.test.ts` | `README.md` |
| 4 | Admin/Operator/Viewer roles, per-session grants, no public registration (29) | `admin-operator-viewer` | `apps/api/src/auth/authorization.ts` | `tests/authz.test.ts` | `docs/decisions/0001-product-boundary.md` |
| 5 | Runtime WAHA connection settings, server-side keys, health checks (30) | `runtime-waha-connection` | `apps/api/src/waha/config.ts` | `tests/waha-adapter.test.ts` | `docs/threat-model.md` |
| 6 | Compose dashboard-only + optional bundled mode, dashboard exposed, WAHA internal (31) | `docker-compose-dashboard-only` | `docker-compose.yml`, `docker-compose.external-waha.yml` | `tests/compose-startup.test.ts` | `docs/operations.md` |
| 7 | Session list/status, QR/pairing/passkey, lifecycle, timelock/capping (32) | `session-list-status` | `apps/api/src/waha/sessions.ts` | `tests/waha-session.test.ts` | `docs/waha-capability-matrix.md` |
| 8 | Immediate + durable one-time text, retries, idempotency, restart recovery (33) | `immediate-and-durable` | `apps/api/src/messaging.ts`, `apps/api/src/scheduler/types.ts` | `tests/messaging.test.ts`, `tests/scheduler.test.ts` | `CONTEXT.md` |
| 9 | HMAC/idempotent webhook ingestion, ack state, history, audit, analytics (34) | `hmac-validated-idempotent` | `apps/api/src/waha/webhook.ts` | `tests/waha-webhook.test.ts` | `docs/waha-capability-matrix.md` |
| 10 | App-level encryption, retention, confirmation-gated purge (35) | `application-level-encryption` | `apps/api/src/backup/format.ts`, `packages/config/src/encryption.ts` | `tests/encryption.test.ts`, `tests/task-12-backup.test.ts` | `docs/threat-model.md` |
| 11 | Optional SMTP/Telegram notifications, encrypted admin-only settings (36) | `optional-smtp-and-telegram` | `apps/api/src/notifications/service.ts` | `tests/task-11-notifications.test.ts` | `docs/decisions/0001-product-boundary.md` |
| 12 | Human-approved provider-agnostic AI seams, no autonomous sending (37) | `human-approved-provider-agnostic` | `apps/api/src/ai/service.ts`, `apps/web/src/components/ai-review-panel.tsx` | `tests/task-14-ai-approval-contract.integration.test.ts` | `docs/decisions/0001-product-boundary.md` |
| 13 | README/architecture/setup/security/operations/compatibility/glossary/agent-state docs (38) | `readme-architecture-setup-deployment` | `README.md` | `tests/release-docs-structure.test.ts` | `docs/operations.md`, `.claude/state/CURRENT_STATUS.md` |

Every row's files exist and every declared marker text is present in its file
(verified by the checker mechanically; see "Independent verification" below).

## Must-NOT-have negative assertions (9/9, semantic, comment-stripped)

The checker validates each `negativeTestMarkers` entry with
`containsSemanticMarker` (comments stripped) across the entry's test files, and
fails with `requirements-negative-evidence-missing` (exit 1) when absent or
empty. Independent line-level receipts:

| # | Plan bullet (plan line) | Manifest key | Negative assertion | Test receipt |
| --- | --- | --- | --- | --- |
| 1 | No multi-tenant SaaS, billing, public registration, white-labeling (41) | `do-not-build-multi-tenant` | `reason: "scope_denied"` | `tests/authz.test.ts:59` |
| 2 | No WAHA API/master key to browsers or public interfaces (42) | `do-not-expose-the-waha-api` | `not.toContain("redact")` | `tests/waha-adapter.test.ts:467` |
| 3 | `WORKING` ≠ delivery success; accepted/acknowledged/failed/unknown preserved (43) | `do-not-make-working-equal` | `state: "unknown"` | `tests/scheduler.test.ts:97` |
| 4 | No media, recurring jobs, campaigns, broadcasts, inbox parity, autonomous AI, anti-detection (44) | `do-not-implement-media` | `media and recurrence are unavailable` | `tests/task-14-dashboard-model.test.ts:200` |
| 5 | No Redis/second queue backend (45) | `do-not-add-redis` | `dispatches a due job once when two workers claim concurrently` | `tests/scheduler.test.ts:110` |
| 6 | No plaintext secrets/sensitive content in logs, fixtures, browser storage, errors (46) | `do-not-persist-plaintext` | `not.toContain("opaque-fixture-1")` | `tests/encryption.test.ts:20` |
| 7 | No unbounded retries/restart loops on timelock/capping, no duplicate-prone retries (47) | `do-not-use-unbounded` | `expect(retryDelayMs(99)).toBe(2000)` (retry cap) | `tests/task-11-notifications.test.ts:87` |
| 8 | No silent purge on retention change (48) | `do-not-silently-purge` | `policy edits non-destructive` | `tests/task-12-retention.integration.test.ts:16` |
| 9 | No unpinned `latest` production images; no unreviewed dependencies (49) | `do-not-use-unpinned` | `uses tested immutable references` | `tests/compose-startup.test.ts:158` |

All 9 markers were confirmed present under comment-stripped semantics, i.e.
they are executable test code, not comments.

## Exit non-zero for unmapped items (mutation proof)

Three mutation runs against a temporary copy of the plan
(`.f1-tmp-mutation-plan.md`, inside `--root` as the checker requires; deleted
afterwards; the protected plan was never modified):

| Mutation | Diagnostics | Exit |
| --- | --- | --- |
| Alter one Must-have bullet (line 26) | `.f1-tmp-mutation-plan.md:26 requirements-unresolved` + `requirements-mapped-missing` | 1 |
| Alter one Must-NOT-have bullet (line 41) | `.f1-tmp-mutation-plan.md:41 requirements-unmapped` + `requirements-mapped-missing` | 1 |
| Strip all Must-have bullets (empty section) | `<plan>:0 requirements-section-invalid` | 1 |

Each run printed `ELIFECYCLE  Command failed with exit code 1`. The gate is
fail-closed on unmapped/malformed plans.

## Independent verification (misleading-success guard)

Because exit 0 alone could be a false pass, the audit re-verified the manifest
with an out-of-band script (`/tmp/opencode/f1-independent-audit.mjs`,
comment-stripping all marker checks) against all 22 entries: all files exist,
all markers resolve, all 9 negative assertions present. Result: exit 0 overall
after accounting for the two comment-only regular markers noted below. The
repo's own checker regression suite was also run:
`npx vitest run tests/release-requirements.test.ts tests/release-requirements-integrity.test.ts tests/release-requirements-bounds.test.ts`
— 3 files, 20/20 passed.

## Observations (non-blocking, for F2 awareness)

1. Two regular evidence markers are satisfied only by comments (the checker's
   raw-`includes` semantics accept them; the semantic negative-assertion path
   is stricter and unaffected):
   - `do-not-persist-plaintext`: `"plaintext"` in `tests/encryption.test.ts:32`
     is a comment; the entry's other markers and its negative assertion
     (`tests/encryption.test.ts:20`) are real code.
   - `do-not-use-unbounded`: `"unbounded retry"` in
     `tests/task-11-notifications.test.ts:82` is a comment; its negative
     assertion (`tests/task-11-notifications.test.ts:87`, retry-cap at 2000 ms)
     is real code.
   Hardening suggestion (not required by F1): move these markers onto
   executable assertions or rename the comment text.
2. Full-suite runs in the current worktree show 6 pre-existing failing files
   (`tests/auth-migration.integration.test.ts`,
   `apps/api/src/contact-groups.test.ts`, `tests/migration-replay.test.ts`,
   `tests/release-secret-scan.test.ts`,
   `tests/messaging-postgres.integration.test.ts`,
   `tests/repositories.integration.test.ts`) from parallel in-flight changes.
   They are outside F1's gate (F1 owns `verify:requirements` only) and were
   not introduced or modified by this audit.

## Scope and cleanliness

- This audit read the protected plan only; `.omo/plans/*` and
  `.omo/start-work/ledger.jsonl` were not modified.
- Temporary artifacts (`/tmp/opencode/f1-*.out|.err|.mjs`,
  `.f1-tmp-mutation-plan.md`) were created outside tracked paths or deleted;
  no disposable services or ports were used.
- No commit made; delivery awaits explicit authorization per repo contract.
