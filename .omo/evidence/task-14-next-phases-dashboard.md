# Todo 14 Slice 5 — Integrated Authenticated Dashboard Matrix

Date: 2026-08-25
Status: focused integrated dashboard verification passed; Todo 14 remains an
open plan item until the orchestrator reconciles all required gates.
Scope: Admin access, session lifecycle/scope behavior, scheduling, notifications,
retention, unavailable AI behavior, logout, scope denial, keyboard/accessibility,
and responsive dashboard states.

Credentials, database URLs, cookies, provider secrets, message content,
recipient data, and opaque identifiers are redacted or omitted. No real WAHA or
recipient delivery is claimed.

## DoneClaim

```yaml
status: PASS_FOCUSED_INTEGRATED_MATRIX
matrix_command_tests: 18/18
session_todo_1_command: 7/7
schedule_unit: 7/7
schedule_integration: 10/10
schedule_browser: 3/3
responsive_widths: [375, 768, 1280]
previous_major_scope_fixes: all_present_and_regressed
product_code_changed_in_this_verification: false
protected_plan_boulder_ledger_state_files_edited: false
ai_behavior: unavailable_without_server_suggestion; no approval or dispatch
real_waha_or_recipient_delivery: NOT_CLAIMED
commit_or_push: NONE
```

## Previous MAJOR scope-fix confirmation

The existing worktree source was inspected before running the matrix. All three
review blockers are present in the current code and remained green under real
browser coverage:

1. **Session-create scope callback:** `apps/web/src/app.tsx` passes the current
   scope request to the create action and refreshes only when the request is
   still current. `apps/web/src/dashboard-controller.ts` provides the
   scope/generation predicate. The held Personal-create/Business-switch browser
   test passed without leaking the completed Personal session into Business.
2. **Notification first render:** `notificationSettingsForScope()` and the
   dashboard notification scope gate reject a previous-scope settings object
   before form hydration. The scope-race unit test and the masked-settings reload
   browser test passed.
3. **Fabricated local AI suggestion:** `MessageComposer` supplies no local
   suggestion from the legacy fixture setting. `AiReviewPanel` renders an
   explicit unavailable state when no server suggestion exists, with no approval
   button. Browser assertions observed zero approval and dispatch requests.

No product source or test code was modified during this verification session;
the current WIP changes were used as supplied.

## Exact integrated matrix command and result

```text
npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/dashboard.spec.ts \
  tests/e2e/task-14-admin-access.spec.ts \
  tests/e2e/schedule-dashboard.spec.ts \
  tests/e2e/schedule-race.spec.ts \
  tests/e2e/visual-capture.spec.ts --reporter=line
PASS — 18 tests (30.6s)
```

The authenticated matrix used a fresh disposable PostgreSQL database, the
deterministic local WAHA seam, Playwright Chromium, and the real same-origin
dashboard route. It covered:

- Admin user creation, role shape, explicit Personal grant, disable, Personal
  command success, Business denial, and denied Admin-only Notifications/Retention
  controls.
- Session link/create, provider-unavailable lifecycle, status history, destructive
  confirmation gates, current-scope session selection, and stale Personal-create
  completion after a Business switch.
- Schedule creation validation, persistence, edit/cancel, recovery and terminal
  locks, CSRF/same-origin checks, cross-scope isolation, and stale detail race.
- Notification masked settings hydration, disabled-channel test state, history,
  and retention preview cancellation, category mismatch, CSRF, and confirmed
  scoped purge.
- AI unavailable state with no fabricated suggestion, no approval action, and no
  non-GET messaging/dispatch request.
- Authenticated logout and compact drawer keyboard/focus behavior.
- Accessibility snapshots and responsive visual capture at 375, 768, and 1280
  CSS pixels, including the Schedule view at 375px.

## Related exact focused commands

### Required Todo 1 session command

```text
npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/task-14-admin-access.spec.ts tests/e2e/dashboard.spec.ts \
  --grep "session|lifecycle|grant|scope"
PASS — 7 tests (21.6s)
```

### Schedule checks

```text
npx --yes pnpm@10.12.4 exec vitest run tests/scheduler.test.ts --reporter=dot
PASS — 1 file, 7 tests

npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-schedule-adversarial.integration.test.ts --reporter=dot
PASS — 2 files, 10 tests, fresh disposable PostgreSQL

npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/schedule-dashboard.spec.ts tests/e2e/schedule-race.spec.ts \
  --reporter=line
PASS — 3 tests (22.9s)
```

The integration cases used redacted `TASK14_DATABASE_URL` and
`ENCRYPTION_MASTER_KEY` environment values. Migration passed before the tests;
the disposable container was removed by an EXIT trap.

### Static/build gates

```text
npx --yes pnpm@10.12.4 exec biome check <28 changed TypeScript/TSX paths>
PASS — 28 files checked; no fixes applied

npx --yes pnpm@10.12.4 typecheck
PASS — workspace tsc build

npx --yes pnpm@10.12.4 --filter @waha-command-center/web build
PASS — Vite production build

GIT_MASTER=1 git diff --check
PASS — no whitespace errors
```

The exposed environment did not provide an LSP diagnostics tool; no LSP result
is claimed. Full workspace lint and full Vitest were not run because this task
requires focused verification only.

## Real-browser QA

The authenticated Playwright E2E matrix is the primary real-browser evidence:
all `18/18` scenarios ran through Chromium against the disposable API and
same-origin Vite preview, with HTTP status/body assertions and visible DOM
assertions rather than trusting runner logs.

An independent MCP pass used the installed Playwright Chromium through a
temporary CDP endpoint because system Chrome is not installed. Against the
pre-existing preview on `4174`, it verified:

- `375px`: document width `375`, no horizontal overflow, no `WAHA_API_KEY` or
  `apiKey` text.
- `1280px`: document width `1280`, no horizontal overflow, no `WAHA_API_KEY` or
  `apiKey` text.

That preserved preview was not backed by the disposable API: `/auth/me`
returned the expected unavailable `500` boundary and the only console errors
were that `500` plus the existing `/favicon.ico` `404`. This MCP pass is not an
authenticated success claim; authenticated UI claims come from the `18/18`
Playwright matrix. The temporary CDP browser/profile/log and MCP snapshots were
removed afterward.

## Adversarial status

| Class | Status | Evidence |
|---|---|---|
| stale-state | PASS | Session-create scope switch, notification scope gate, schedule generation race, and stale retention preview all passed. |
| malformed-input | PASS | Schedule, AI HTTP, form, and retention boundaries returned generic safe failures; no validation internals rendered. |
| dirty-worktree | PASS | Pre-existing WIP, `.omo/boulder.json`, protected plan, and prior evidence were preserved; no reset, clean, commit, or push. |
| flaky | PASS | Final focused runs passed with zero retries. Two earlier schedule integration attempts failed only in the local shell harness (invalid env-array syntax, then wrong key encoding) before test collection; neither was counted as a product result. |
| long-command | PASS | All commands completed within bounded timeouts; no hung process or partial log was treated as success. |
| misleading-success | PASS | Matrix assertions checked statuses, bodies, rendered state, persistence, denial, CSRF/Origin, masked secrets, no dispatch, and responsive layout. |
| repeated-interruption | NOT INDUCED | No external interruption was generated; global teardown and EXIT traps were verified after each disposable run. |
| prompt injection | NOT APPLICABLE | Current AI state has no prompt-bearing input or local generation path. |
| real provider delivery | NOT CLAIMED | No real WAHA, SMTP, Telegram, WhatsApp account, or recipient was used. |

## Cleanup receipt

- E2E global teardown removed its disposable PostgreSQL, API process, WAHA
  fixture, `.tmp/playwright`, and task-owned Playwright results.
- The focused schedule integration container was stopped and removed by its EXIT
  trap.
- The temporary MCP Chromium/CDP profile, log, `.playwright-mcp` snapshots, and
  task-owned `.debug-journal.md` were removed.
- Final checks found ports `4173`, `4317`, and `9222` free. The pre-existing Vite
  preview on `4174` was preserved.
- Unrelated `task14-manual-api-12656`, WAHA, and observability containers were
  not stopped or removed.
- Refreshed dashboard screenshots/accessibility snapshots are retained as
  task-owned evidence; they are not runtime artifacts.

## Limitations and handoff

This is a focused Wave 1 evidence closeout, not a claim that the protected plan,
Todo 14, the full suite, release gates, bundled WAHA, real provider linking, or
recipient delivery are complete. The orchestrator should review the resulting
evidence and existing WIP before deciding what to commit; this session made no
commit or push.
