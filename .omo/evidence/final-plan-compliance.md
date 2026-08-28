# F1 Plan-Compliance Audit

Date: 2026-08-28  
Repository: RelayNest  
Audit mode: read-only repository inspection and safe command execution  
Write scope: this evidence file only

## Verdict

**BLOCKED.** The required original-plan requirements checker passed with no
diagnostics: all 13 original Must-have bullets and all 9 original Must-NOT-have
bullets matched the repository evidence manifest, including the declared
negative assertion markers. The final F1 gate cannot be approved because the
protected plan and execution ledger still contain open completion markers for
Todo 15, Todo 16, and F1-F4, the next-phases plan still has Todos 6-11 and F1-F4
open, and the recorded release blockers remain unresolved. No protected record
was changed to make this audit appear complete.

The narrow result is therefore:

| Check | Result |
|---|---|
| Original scope mapping (13 Must-have + 9 Must-NOT-have) | **PASS** |
| Next-phases scope mapping (5 Must-have + 5 Must-NOT-have) | **NOT COVERED by the original manifest; independently reconciled below** |
| Protected plan/ledger completion state | **OPEN** |
| F1 final gate | **BLOCKED** |

## 1. Exact commands and results

### Required F1 command against the original protected plan

```text
npx --yes pnpm@10.12.4 verify:requirements --plan .omo/plans/waha-command-center.md
```

Result: exit `0`. The wrapped requirements checker emitted no diagnostic lines.
It validated the canonical sections, matched every original scope bullet to the
declared evidence manifest, verified all referenced implementation/test/reference
files and markers, and verified a negative assertion marker for each original
Must-NOT-have entry.

### Supplemental numbering check against the next-phases plan

```text
npx --yes pnpm@10.12.4 verify:requirements --plan .omo/plans/relaynest-next-phases.md
```

Result: exit `1`. The checker reported `requirements-unresolved` for the five
next-phases Must-have bullets, `requirements-unmapped` for its five Must-NOT-have
bullets, and `requirements-mapped-missing` diagnostics for the original manifest
keys. This is recorded as a numbering/manifest limitation, not as a failure of
the required original-plan command: the checker manifest is keyed to the
original plan's 13+9 scope bullets and does not contain the next-phases wording.

### Mapped-file existence check

The implementation, test, and reference paths declared by
`scripts/requirements-evidence.mts` and `scripts/requirements-guardrails.mts`
were checked as tracked files. Result: `35` declared paths present. No source or
test file was changed during this audit.

## 2. Plan numbering and scope shape

The two protected plans are separate records and their numbering is kept
explicit here:

| Plan | Scope sections | Todo checkbox state observed |
|---|---:|---|
| Original `.omo/plans/waha-command-center.md` | 13 Must-have, 9 Must-NOT-have | Original Todos 1-14 checked; Original Todos 15-16 and Original F1-F4 unchecked |
| Next-phases `.omo/plans/relaynest-next-phases.md` | 5 Must-have, 5 Must-NOT-have | Next-phases Todos 1-5 checked; Next-phases Todos 6-11 and Next-phases F1-F4 unchecked |

The original plan's final success criteria require all 16 original Todos and
F1-F4. A checked implementation Todo is not treated as a whole-plan release
approval when its evidence records a limitation or a later gate remains open.

## 3. Original plan Must-have coverage

IDs in this section are **Original Must-have** IDs, not next-phases Todo IDs.
The implementation/test/reference paths are the exact paths in the verifier's
manifest. Every row below was accepted by the required command.

| ID | Requirement (short form) | Implementation reference(s) | Test reference(s) | Result |
|---|---|---|---|---|
| O-MH-01 | Single-tenant self-hosted multi-user Personal/Business command center | `apps/api/src/app.ts` | `tests/task-14-dashboard-model.test.ts` | **PASS**; marker and files verified |
| O-MH-02 | Version-pinned official WAHA OpenAPI capability matrix | `docs/waha-capability-matrix.md` | `tests/waha-adapter.test.ts` | **PASS**; matrix/OpenAPI markers verified |
| O-MH-03 | Strict TypeScript modular monolith and pinned workspace toolchain | `package.json`, `tsconfig.json` | `tests/workspace-smoke.test.ts` | **PASS**; workspace markers verified |
| O-MH-04 | Admin/Operator/Viewer roles and per-session grants | `apps/api/src/auth/authorization.ts` | `tests/authz.test.ts` | **PASS**; role/grant markers verified |
| O-MH-05 | Runtime WAHA connection settings, server-side keys, and health seam | `apps/api/src/waha/config.ts` | `tests/waha-adapter.test.ts` | **PASS**; server-only/config markers verified |
| O-MH-06 | Dashboard-only Compose mode and optional internal bundled mode | `docker-compose.yml`, `docker-compose.external-waha.yml` | `tests/compose-startup.test.ts` | **PASS**; Compose/operations evidence verified |
| O-MH-07 | Session list/status and lifecycle/linking capability surface | `apps/api/src/waha/sessions.ts` | `tests/waha-session.test.ts` | **PASS**; session-scope markers verified |
| O-MH-08 | Immediate and durable one-time individual text messaging | `apps/api/src/messaging.ts`, `apps/api/src/scheduler/types.ts` | `tests/messaging.test.ts`, `tests/scheduler.test.ts` | **PASS**; idempotency/durable markers verified |
| O-MH-09 | HMAC-validated, idempotent webhook/event ingestion | `apps/api/src/waha/webhook.ts` | `tests/waha-webhook.test.ts` | **PASS**; signed-webhook/HMAC markers verified |
| O-MH-10 | Application-level encryption and configurable retention/purge | `apps/api/src/backup/format.ts`, `packages/config/src/encryption.ts` | `tests/encryption.test.ts`, `tests/task-12-backup.test.ts` | **PASS**; authenticated encryption markers verified |
| O-MH-11 | Optional SMTP and Telegram notifications | `apps/api/src/notifications/service.ts` | `tests/task-11-notifications.test.ts` | **PASS**; channel/test markers verified |
| O-MH-12 | Human-approved provider-agnostic AI suggestions, no autonomous send | `apps/api/src/ai/service.ts`, `apps/web/src/components/ai-review-panel.tsx` | `tests/task-14-ai-approval-contract.integration.test.ts` | **PASS**; approval/`not_sent` markers verified |
| O-MH-13 | README, architecture, setup, security, operations, compatibility, glossary, and state docs | `README.md` | `tests/release-docs-structure.test.ts` | **PASS**; documentation/state markers verified |

### Original Must-have acceptance evidence by Todo

This table checks the broader Todo implementation/test references in the
original plan in addition to the narrow scope manifest. Status is not silently
upgraded when a later environment or final-gate condition remains open.

| ID | Protected checkbox | Evidence/reference | Audit classification |
|---|---|---|---|
| Original Todo 1 | `[x]` | `.omo/evidence/task-1-waha-command-center.md` | Evidence present for the pinned capability matrix and validator; no live WAHA image-runtime claim. |
| Original Todo 2 | `[x]` | `.omo/evidence/task-2-waha-command-center.md`, `CONTEXT.md`, `docs/threat-model.md`, `docs/decisions/0001-product-boundary.md` | Evidence present for glossary, threat model, decisions, and explicit boundaries. |
| Original Todo 3 | `[x]` | `.omo/evidence/task-3-waha-command-center.md`, `package.json`, workspace configs | Evidence present for the typed workspace, Compose skeleton, and pinned toolchain. |
| Original Todo 4 | `[x]` | `.omo/evidence/task-4-waha-command-center.md`, `.omo/evidence/task-12-waha-command-center.md` | Evidence present for migrations, repositories, encryption, scope constraints, and immutable audit behavior. |
| Original Todo 5 | `[x]` | `.omo/evidence/task-5-waha-command-center.md`, auth source/tests | Evidence present for bootstrap, roles, grants, revocation, rate limits, and server-side scope authorization. |
| Original Todo 6 | `[x]` | `.omo/evidence/task-6-waha-command-center.md`, WAHA adapter/config source/tests | Evidence present for typed adapter errors, timeout/cancellation, redaction, capability negotiation, and Admin settings. Real WAHA is not claimed. |
| Original Todo 7 | `[x]` | `.omo/evidence/task-7-waha-command-center.md`, `.omo/evidence/task-14-next-phases-session.md` | Contract and deterministic/browser seam evidence present; real WAHA linking and provider delivery are not claimed. |
| Original Todo 8 | `[x]` | `.omo/evidence/task-8-waha-command-center.md`, webhook source/tests | Evidence present for HMAC, replay, idempotency, ordering, ACK state, redaction, and size bounds. |
| Original Todo 9 | `[x]` | `.omo/evidence/task-9-waha-command-center.md`, scheduler source/tests | Evidence present for one-time durable jobs, leases, retries, recovery, safety gates, and duplicate-worker protection. |
| Original Todo 10 | `[x]` | `.omo/evidence/task-10-waha-command-center.md`, messaging/contact/scheduler source/tests | Evidence present for scoped contact resolution, individual text sends, safety gates, idempotency, and safe ACK semantics. |
| Original Todo 11 | `[x]` | `.omo/evidence/task-11-waha-command-center.md`, notification source/tests | Evidence present for independently enabled encrypted channels, masks, test sends, retries, and failure history. |
| Original Todo 12 | `[x]` | `.omo/evidence/task-12-waha-command-center.md`, backup/retention source/tests | Evidence present for confirmation-gated purge, content-free audit, authenticated backup/restore, relational bounds, and wrong-key rejection. |
| Original Todo 13 | `[x]` | `.omo/evidence/task-13-waha-command-center.md`, analytics source/tests | Evidence present for scoped projections, unknown/partial evidence, status history, retries, safety indicators, and authorization. |
| Original Todo 14 | `[x]` | `.omo/evidence/task-14-waha-command-center.md`, `.omo/evidence/task-14-next-phases-dashboard.md` | Focused authenticated dashboard matrix is evidenced, but the reports explicitly retain final reconciliation and real-provider/runtime limitations. This is not a whole-plan completion claim. |
| Original Todo 15 | `[ ]` | `.omo/evidence/task-15-next-phases-compose.md`, `.omo/evidence/task-15-next-phases-operations.md`, `.omo/evidence/task-15-next-phases-bundled.md` | **BLOCKED**: external/configuration boundaries are evidenced, but the exact bundled image and supported runtime secret boundary are unavailable. |
| Original Todo 16 | `[ ]` | `.omo/evidence/task-16-next-phases-tooling.md`, `.omo/evidence/task-16-next-phases-release.md` | **VERIFIED WITH BLOCKERS/LIMITATIONS**, not complete: full lint is non-zero, external scanners are unavailable, and several runtime/browser claims remain partial or unverified. |

## 4. Original plan Must-NOT-have coverage

IDs in this section are **Original Must-NOT-have** IDs. The required checker
verified a declared negative marker for each row. The supplemental evidence
references are included because a manifest marker is not itself a runtime or
real-provider claim.

| ID | Guardrail (short form) | Implementation/reference surface | Negative test reference | Result and boundary |
|---|---|---|---|---|
| O-MN-01 | No multi-tenant SaaS, billing, public registration, or white-labeling | `docs/decisions/0001-product-boundary.md`, `README.md` | `tests/authz.test.ts` | **PASS**; scope denial marker verified; single-tenant boundary is documented. |
| O-MN-02 | No browser/public exposure of WAHA API or master key | `apps/web/src/components/admin-pages.tsx`, `.claude/SECURITY_STANDARDS.md` | `tests/waha-adapter.test.ts` | **PASS**; server-only and redaction/non-disclosure markers verified; no browser credential claim. |
| O-MN-03 | `WORKING` is not delivery success | `apps/api/src/scheduler/types.ts`, `docs/threat-model.md` | `tests/scheduler.test.ts` | **PASS**; explicit `unknown` state marker verified; transport acceptance remains distinct from delivery. |
| O-MN-04 | No media, recurrence, campaigns, broadcasts, full inbox parity, autonomous AI sending, or anti-detection behavior | `apps/web/src/components/message-composer.tsx`, `CONTEXT.md` | `tests/task-14-dashboard-model.test.ts` | **PASS** for the declared media/recurrence negative marker; the compound boundary's campaign, broadcast, inbox, autonomous, and anti-detection absence is additionally covered by the manual source/docs review in `.omo/evidence/final-scope-docs.md`. |
| O-MN-05 | No Redis or second queue backend without approval | `apps/api/src/scheduler/database.ts`, `docs/decisions/0001-product-boundary.md` | `tests/scheduler.test.ts` | **PASS**; concurrent worker claim-once negative marker verified; PostgreSQL scheduling evidence is in Todo 9. |
| O-MN-06 | No plaintext secrets or sensitive content in logs, fixtures, browser storage, or errors | `packages/config/src/encryption.ts`, `.claude/SECURITY_STANDARDS.md` | `tests/encryption.test.ts` | **PASS**; ciphertext does not contain the opaque plaintext fixture marker; task evidence is redacted. |
| O-MN-07 | No unbounded retries or automatic timelock/capping restart loops | `apps/api/src/notifications/service.ts`, `docs/threat-model.md` | `tests/task-11-notifications.test.ts` | **PASS**; bounded retry marker verified; scheduler evidence separately records bounded recovery/no automatic restart. |
| O-MN-08 | Retention changes do not silently purge existing data | `apps/api/src/retention/service.ts`, `docs/operations.md` | `tests/task-12-retention.integration.test.ts` | **PASS**; policy-edit non-destructive marker verified; purge requires preview and confirmation. |
| O-MN-09 | No unpinned production `latest` images or unreviewed dependencies | `docker-compose.yml`, `docs/operations.md` | `tests/compose-startup.test.ts` | **PASS**; tested immutable-reference marker verified; dependency pin/audit decision is recorded. |

The existing final scope/docs review independently found no forbidden MVP
implementation path or public WAHA port exposure. It also explicitly states
that no real provider, bundled runtime, native WAHA dashboard parity, account
safety, or recipient-delivery claim is being made.

## 5. Next-phases plan coverage

The next-phases plan uses a different scope section and different Todo numbering.
It is not silently treated as the original plan. The following rows are an
independent reconciliation against the next-phases plan, its listed source/test
references, and the current evidence artifacts.

### Next-phases Must-have coverage

| ID | Requirement (short form) | Implementation/test/evidence references | Classification |
|---|---|---|---|
| N-MH-01 | Complete authenticated dashboard acceptance for sessions, schedules, notifications, retention, Admin/grants, scope denial, accessibility, and human-approved AI | `tests/e2e/dashboard.spec.ts`, `tests/e2e/task-14-admin-access.spec.ts`, `tests/e2e/schedule-race.spec.ts`, `.omo/evidence/task-14-next-phases-{session,scheduling,notifications-retention,ai,dashboard}.md` | **PARTIAL / focused evidence present**. The integrated matrix passed, but release evidence leaves browser worker restart, browser double-submit, browser backup/restore, real AI approval, native WAHA parity, real linking, and recipient delivery unverified. |
| N-MH-02 | Preserve and prove server-side scope, grants, CSRF, same-origin, and secret redaction | Auth/retention/WAHA HTTP source and tests; `.omo/evidence/final-security-quality.md`; `.omo/evidence/final-scope-docs.md` | **PASS for inspected/tested seams**. No cross-scope or credential exposure was proven; unavailable runtime/scanner limits remain. |
| N-MH-03 | Validate external and bundled Compose modes, blocking bundled runtime if the exact image is unavailable | `docker-compose*.yml`, `tests/compose-startup.test.ts`, `.omo/evidence/task-15-next-phases-compose.md`, `.omo/evidence/task-15-next-phases-bundled.md` | **BLOCKED** for complete Todo acceptance. External/configuration boundaries pass; the exact bundled image has no manifest and no supported runtime secret boundary is verified. |
| N-MH-04 | Add reproducible local requirements, secret, scope, and docs verification commands | `package.json`, `scripts/release-checks.mts`, `scripts/requirements-evidence.mts`, `tests/release-*.test.ts`, `.omo/evidence/task-16-next-phases-tooling.md` | **PASS for implementation and focused tests**. The four local commands and intentional-failure tests are evidenced; unavailable external tools are not counted. The protected Todo remains unchecked. |
| N-MH-05 | Produce redacted tranche evidence, update live state, commit atomically, and push after verification | `.omo/evidence/` tranche artifacts; `.claude/state/`; current Git status and protected records | **BLOCKED / open process gate**. Redacted evidence exists, but this worktree is dirty, the current F1 artifact was absent until this report, and this audit is forbidden from updating state, plan, ledger, committing, or pushing. |

### Next-phases Must-NOT-have coverage

| ID | Guardrail (short form) | Evidence/reference | Classification |
|---|---|---|---|
| N-MN-01 | No media, full inbox, recurrence, campaigns, broadcasts, registration, scraping, spam, stealth, anti-detection, or ban evasion | `README.md`, `CONTEXT.md`, `docs/threat-model.md`, `docs/operations.md`, `.omo/evidence/final-scope-docs.md` | **PASS for the inspected source/docs boundary**; no forbidden implementation path was found. |
| N-MN-02 | No autonomous AI sending; approval remains human-confirmed with `sendState: "not_sent"` | AI source/components/tests; `.omo/evidence/task-14-next-phases-ai.md`; `.omo/evidence/final-scope-docs.md` | **PASS for the tested seam**; approval records `not_sent` and observed dispatch calls remain zero. |
| N-MN-03 | No browser-visible WAHA credentials, public master-port exposure, auth bypass, scope weakening, or client-only authorization | `.claude/SECURITY_STANDARDS.md`; auth/WAHA/Compose source/tests; `.omo/evidence/final-security-quality.md` | **PASS for inspected/tested boundaries**; the report does not elevate this to a security certification while external scanners/runtime paths are unavailable. |
| N-MN-04 | No real WhatsApp account/credential, fabricated delivery claim, or guessed/untested bundled image tag | `.omo/evidence/task-16-next-phases-release.md`; `.omo/evidence/task-15-next-phases-bundled.md`; `docs/operations.md` | **PASS as a negative-claim guardrail**; real provider/account/linking/delivery and bundled runtime are explicitly not claimed, and no replacement tag was guessed. |
| N-MN-05 | Do not mark a Todo or final gate complete while its command, evidence, or environment prerequisite is unavailable | Both plan checkbox sections; `.claude/state/CURRENT_STATUS.md`; `.claude/state/TASK_QUEUE.md`; ledger; F2/F4 evidence | **PASS for the observed no-false-completion behavior**; open checkboxes and blocked evidence remain open. This does not authorize changing them. |

## 6. Protected plan, ledger, and worktree status

### Protected plan checkboxes

The protected original plan currently has `[x]` for Original Todos 1-14 and
`[ ]` for Original Todos 15-16 and Original F1-F4. The protected next-phases
plan currently has `[x]` for Next-phases Todos 1-5 and `[ ]` for Next-phases
Todos 6-11 and Next-phases F1-F4. These states were observed, not changed.

### Execution ledger

`.omo/start-work/ledger.jsonl` contains 19 `task-completed` records: 14 records
for `.omo/plans/waha-command-center.md` (Original Todos 1-13 plus a
`12-review-hardening` record) and 5 records for
`.omo/plans/relaynest-next-phases.md` (Next-phases Todos 1-5). There is no
ledger completion event for Original Todo 14, Original Todos 15-16, Original
F1-F4, Next-phases Todos 6-11, or Next-phases F1-F4. The absence is reported as
an open protected gate; no ledger line was appended or rewritten.

### Protected-file immutability receipt

At audit time, the following commands established branch parity and protected
file immutability:

```text
git rev-parse HEAD
113efd07c91ed828127560e0428528b8cc12f976

git rev-parse origin/main
113efd07c91ed828127560e0428528b8cc12f976

git diff --quiet -- .omo/plans/waha-command-center.md .omo/plans/relaynest-next-phases.md .omo/start-work/ledger.jsonl
protected_diff_exit=0
```

Current SHA-256 values matched the corresponding `HEAD` values:

| Protected file | Current SHA-256 | Diff result |
|---|---|---|
| `.omo/plans/waha-command-center.md` | `5fdca54d8679c1dd84e96345b5ac6017651dc8e08508b3b75d2ace4ac6f008fa` | unchanged |
| `.omo/plans/relaynest-next-phases.md` | `adcdf1f3485d1c993bfe3dd402236ebf3e6cd63a125057c869a471f38b4ccd8f` | unchanged |
| `.omo/start-work/ledger.jsonl` | `c81c1a0f7cd10de291bed2163d1842c0447639dbd6ddd67100774827fc61e07a` | unchanged |

`.omo/boulder.json` is absent in the current worktree and is a pre-existing
deletion. Its deletion was not restored, edited, or used as a reason to change
the protected plan or ledger.

### Worktree baseline

Before this report was added, the worktree contained the user-described
uncommitted documentation/evidence/state changes and the pre-existing
`.omo/boulder.json` deletion. The audit did not modify those paths. The only
intended new path from this audit is `.omo/evidence/final-plan-compliance.md`.

During final validation, untracked `final-e2e.md`, `final-security-quality.md`,
and `final-scope-docs.md` were also observed, although they were not present in
the baseline status recorded at audit start. They were not created, edited,
removed, or used as approval evidence by this audit. The observed F3 report is
`BLOCKED/PARTIAL`, and the observed F2/F4 reports remain blocked; their presence
does not change the protected checkbox or ledger state.

`APP_ENV` and `NODE_ENV` were unset. `.env` and `.env.*` are ignored by Git. No
service, container, external scanner, real WAHA account, real credential, or
message payload was used by this audit.

## 7. Release blockers and next action

### Root causes of BLOCKED

1. **Protected completion state is open.** Original Todo 15, Original Todo 16,
   Original F1-F4, Next-phases Todos 6-11, and Next-phases F1-F4 are unchecked;
   corresponding completion events are absent from the protected ledger.
2. **Bundled runtime prerequisite is unavailable.** The exact pinned
   `devlikeapro/waha:2026.8.1` image has no registry manifest, and a supported
   runtime secret boundary has not been established. Configuration validation and
   a credential-free fail-closed guard are not bundled runtime acceptance.
3. **Whole-plan release gates are not all green.** Full lint remains non-zero
   with six known diagnostics, external security/documentation scanners are
   unavailable, and the release evidence records partial or unverified browser
   worker restart, browser double-submit, browser backup/restore, real AI
   approval, native WAHA dashboard parity, real linking, account safety, and
   recipient delivery paths.
4. **The next-phases checker is not the original F1 checker.** Its non-zero
   result reflects missing next-plan manifest entries and is retained as an
   explicit numbering limitation rather than silently treating the two plans as
   one numbering system.

### Required next action

An authorized follow-up/orchestrator must keep the protected records unchanged
until the prerequisites are actually satisfied, then:

1. Resolve the exact bundled image availability and establish a supported,
   runtime-tested secret boundary, or retain the bundled blocker.
2. Resolve or explicitly account for the six full-lint diagnostics and run the
   unavailable external scanners with their results; retain `UNAVAILABLE` when a
   tool cannot run.
3. Reconcile the concurrent final F3 artifact and complete its partial release
   browser/runtime scenarios, without using real credentials or fabricating
   delivery.
4. Reconcile the original and next-phases Todo statuses and ledger events only
   with explicit authorization and verified evidence.
5. Rerun the exact original F1 command and all applicable final gates. Approve F1
   only when the protected gate state, evidence, and required prerequisites are
   reconciled without unresolved Must-have or Must-NOT-have coverage gaps.

## 8. Redaction and non-claims

This report retains only repository-relative paths, safe command names, exit
codes, counts, statuses, and protected-file hashes. It omits secret values,
credential-bearing URLs, provider URLs, passwords, tokens, cookies, message or
recipient content, temporary identifiers, and raw logs.

The report does not claim:

- bundled WAHA startup, health, UID, linking, account safety, or delivery;
- real WhatsApp, SMTP, Telegram, or AI provider use;
- recipient delivery from HTTP acceptance, `WORKING`, or transport ACK;
- unavailable external scanner results;
- a clean worktree, commit, push, or protected-plan/ledger completion;
- whole-plan completion.

The sole repository change made for this audit is this evidence file.
