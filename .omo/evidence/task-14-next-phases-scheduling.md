# Todo 14 Slice 2 — Authenticated Scheduling Verification

Date: 2026-08-25
Status: focused authenticated scheduling verification passed.
Scope: persisted one-time schedule list/detail/edit/cancel, recovery visibility,
terminal locks, scope/grant authorization, CSRF/same-origin mutation proof, and
stale-response protection.

All database URLs, credentials, message content, recipient data, provider
payloads, and opaque identifiers are redacted or omitted. This record does not
claim real WAHA or recipient delivery.

## DoneClaim

```yaml
status: PASS_FOCUSED_VERIFICATION
slice: Todo 14 scheduling acceptance
unit_tests: 7/7
integration_tests: 10/10
authenticated_browser_tests: 3/3
stale_detail_race: PASS
scope_csrf_terminal_lock_cases: PASS
product_code_changed_in_this_verification: false
protected_plan_boulder_ledger_state_files_edited: false
real_waha_or_recipient_delivery: NOT_CLAIMED
commit_or_push: NONE
```

## Source confirmation

The already-written worktree changes were inspected before verification. The
schedule surface is wired through the typed dashboard schedule adapter and
controller, renders recovery fields without message/recipient/lease fields, and
uses a generation guard so an older detail response cannot replace the current
selection. No additional product fix was needed after the focused tests passed.

Relevant current surfaces:

- `apps/web/src/components/schedule-jobs-panel.tsx` — authenticated list/detail,
  editable-state gate, recovery state, terminal lock, and mutually exclusive
  Save/Cancel controls.
- `apps/web/src/dashboard-schedule-api.ts` — scope-bearing list/detail/edit/cancel
  requests with typed response parsing and CSRF mutation handling.
- `apps/web/src/schedule-controller.ts` — selected-session/job generation guards
  and post-mutation refresh behavior.
- `tests/e2e/schedule-dashboard.spec.ts` and
  `tests/e2e/schedule-race.spec.ts` — real-browser persisted and stale-response
  coverage.

## Exact commands and results

### Scheduler unit behavior

```text
npx --yes pnpm@10.12.4 exec vitest run tests/scheduler.test.ts --reporter=dot
PASS — 1 file, 7 tests
```

The unit cases cover one-dispatch concurrency, ambiguous provider timeout
recovery, safety-gate refusal, expired-lease recovery, bounded transient retry,
claimed-job cancellation locking, timezone validation, and WAHA safety
classification.

### Authenticated schedule API integration

A fresh disposable PostgreSQL 16 container was migrated and removed by an EXIT
trap. The actual environment values are redacted here:

```text
env APP_ENV=test NODE_ENV=test DATABASE_URL=<REDACTED> ENCRYPTION_MASTER_KEY=<REDACTED> \
  npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
PASS — migrations applied successfully.

env TASK14_DATABASE_URL=<REDACTED> DATABASE_URL=<REDACTED> APP_ENV=test \
  NODE_ENV=test ENCRYPTION_MASTER_KEY=<REDACTED> \
  npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-schedule-adversarial.integration.test.ts --reporter=dot
PASS — 2 files, 10 tests
```

Observed integration outcomes:

- Happy list/detail/edit/cancel paths returned the authenticated scoped DTOs;
  repeated cancellation stayed idempotent.
- Persisted `unknown` plus `lease_expired` recovery was visible without message,
  recipient, idempotency, lease-owner, or opaque provider fields.
- Cross-scope, ungranted, cross-session job-ID, malformed UUID/scope/body,
  missing/invalid CSRF, and foreign-Origin requests failed generically with no
  sensitive output.
- A submitted terminal job rejected both edit and cancel with `409
  schedule_locked`.

### Required authenticated schedule browser command

```text
npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/schedule-dashboard.spec.ts tests/e2e/schedule-race.spec.ts \
  --reporter=line
PASS — 3 tests (22.9s)
```

The three tests covered terminal/recovery rendering and locks, malformed edit
input followed by a valid persisted edit, missing-CSRF denial, Personal-to-
Business isolation, and the deferred older-detail response race. Browser
assertions verified that no immediate provider dispatch occurred.

## Browser scenarios

| Scenario | Result | Observable proof |
|---|---|---|
| List and inspect a persisted future job | PASS | Authenticated list/detail request and scoped DTO rendered. |
| Edit then reload | PASS | Valid future time persisted and reappeared after reload. |
| Cancel then reload/state change | PASS | State became `cancelled`; edit/cancel controls disappeared. |
| Recovery | PASS | `unknown` and `lease_expired` remained visible and non-editable. |
| Cross-scope and ungranted access | PASS | Generic denial; no schedule content leaked. |
| Malformed input | PASS | `400 {"error":"invalid request"}` at the HTTP seam. |
| Missing/invalid CSRF or foreign Origin | PASS | `403 {"error":"forbidden"}` and no mutation. |
| Terminal lock | PASS | Edit and cancel returned `409 schedule_locked`. |
| Stale detail response | PASS | Older deferred response could not replace the newer job. |

## Adversarial status

| Class | Status | Evidence |
|---|---|---|
| stale-state | PASS | Generation-guard race E2E and persisted reload/scope assertions passed. |
| malformed-input | PASS | UUID, scope, body, date, and timezone failures returned generic `400`. |
| dirty-worktree | PASS | Existing WIP/protected changes were preserved; no reset, clean, commit, or push. |
| flaky | PASS | Final unit, integration, and browser runs passed with zero retries; earlier setup-only harness mistakes were not counted as tests. |
| long-command | PASS | Commands completed within bounded tool timeouts; no hung process was treated as success. |
| misleading-success | PASS | Assertions checked HTTP status/body, rendered state, persistence, locks, and zero dispatch—not logs alone. |
| repeated-interruption | NOT INDUCED | No external interruption was generated; every disposable DB/browser/API run had cleanup traps/global teardown. |
| prompt injection | NOT APPLICABLE | This slice has no prompt-bearing input or generation path. |
| real provider delivery | NOT CLAIMED | Deterministic/local seams only; no real WAHA, WhatsApp account, or recipient was used. |

## Cleanup receipt

- The disposable PostgreSQL container used for integration was stopped and
  removed by its shell EXIT trap.
- Playwright global teardown stopped its disposable API, database, and WAHA
  fixture and removed `.tmp/playwright`; task-owned `test-results/` was absent.
- The temporary MCP Chromium/CDP browser, profile, log, and `.playwright-mcp`
  snapshots were removed. Task-owned `.debug-journal.md` was removed.
- Ports `4173`, `4317`, and `9222` were free after cleanup. The pre-existing
  Vite preview on `4174` remained listening as required.
- Unrelated Compose/observability/WAHA containers were not stopped or removed.

## Limitations

This artifact verifies authenticated deterministic/local scheduling seams. It
does not prove real WAHA linking, provider submission, recipient delivery, or
that an acknowledgment means a recipient saw the message.
