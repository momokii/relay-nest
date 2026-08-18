# Task Queue

Top-level execution remains **IN PROGRESS**. Todos 1-12 are complete. Todo 12
implementation and verification are recorded in local semantic commits; final
branch synchronization is pending. The protected plan and ledger are the approved
scope/history; this queue is the live operational view.

## Completed implementation

Todos 1-12 are DONE. Todo 12 is **IMPLEMENTED, VERIFIED, AND COMMITTED LOCALLY**:
retention policies, scoped preview/confirmation purge,
immutable content-free audit accountability, encrypted backup/restore,
key-rotation guidance, independent two-worker claim coverage, and auth HTTP
fixture coverage for authorized WAHA reads versus genuine unavailability. Its
source, tests, evidence, and documentation are recorded in local commits.

Final acceptance follow-up is complete: the intermittent messaging integration
failure was reproduced and fixed as a shared-fixture isolation issue, not a
product encryption issue. The messaging fixture now uses an explicit
`2000-01-01` synthetic clock; opaque repository and retention jobs are cancelled
after their assertions. Three fresh PostgreSQL 17.6 standard runs passed (`31
files, 120 passed` each), along with the focused, concurrency, auth, migration,
manual API, build, security, Compose, capability, and local documentation checks.

## Todo 12 backup hardening follow-up

Outer format/version/scope/key metadata and malformed authentication-tag
tampering are covered by focused unit tests. The authenticated metadata contract
uses outer format version `2`; old version-1 envelopes fail closed because they
cannot authenticate all metadata.

The remaining Todo 12 backup security blockers are now implemented and focused-
verified. Relational references fail closed before restore writes, transfer
limits are explicit, restore uses bounded chunks, and session messaging safety
is included in the allowlisted backup tables.

The export follow-up is also implemented and verified: all descriptor/page queries
share a repeatable-read, read-only PostgreSQL snapshot; metadata byte selection
accounts for JSON array delimiters before payload fetch; oversized first rows
fail before payload JSON transfer; and users referenced only by session grants
are included. The final review-fix source/test changes are committed as
`a69c248`; post-fix focused verification passed `8 files, 40 tests`, and the
stable fork-pool full suite passed `33 files, 138 tests`.

## Remaining queue

| Item | Status | Dependency |
|---|---|---|
| Todo 13 analytics projections | TODO | Todos 8-12 |
| Todo 14 dashboard and human-approved AI seam | IN PROGRESS | Todos 5, 7, 9-13 |
| Todo 15 Compose deployment and operations | TODO | Todos 1, 3, 6, 7 |
| Todo 16 release verification | TODO | Todos 11-15 |
| F1 plan compliance | TODO | Todo 16 |
| F2 security and quality | TODO | Todo 16 |
| F3 executable end-to-end QA | TODO | Todo 16 |
| F4 scope/documentation review | TODO | Todo 16 |

## Session follow-up

WAHA runtime connection create/update audit events are implemented and focused-
verified. No application wiring task was added because `createApiApp` does not
compose the runtime-settings service; future route composition must pass the
central audit callback and actor identity through the existing typed seam.

## Required closeout

Do not claim the plan complete until all 16 Todos and F1-F4 have evidence.
Required checks include lint, typecheck, full tests, E2E, high-severity audit,
both Compose configurations, secret/docs/scope checks where available, and
explicit review of no unresolved security blockers. Push only after independent
verification and a clean-tree/remote check.

## Final review blockers

The implementation/test defects found by review are fixed in `a69c248` and
verified by the stable `33 files, 138 tests` suite. Delivery remains blocked by
the unassessed security lane, the earlier protected plan/ledger mutations, and
the uncomposed WAHA runtime-settings audit seam; these require an explicit
authorization/product decision rather than silent code changes.

## Todo 14 session follow-up

The scope-safe session lifecycle/status preview is implemented and browser-
verified. The UI exposes confirmation-gated Start/Stop/Restart/Logout/Delete
controls and explicit unavailable status-history/provider states. It does not
claim authenticated backend completion; session linking/recovery and
server-backed lifecycle/status routes remain acceptance blockers alongside the
other items recorded in the Todo 14 evidence report.

## Todo 14 dashboard completion pass

The authenticated dashboard now has backend-backed scope navigation, scheduling,
notifications, retention, session lifecycle/status previews, logout, explicit
ready-empty schedule guidance, and an honest unavailable AI review state. The
test harness passes an explicit loopback permission flag only in test mode, and
the application boundary independently clamps that permission to test mode.

Focused verification is complete: changed-file Biome, typecheck, production
build, targeted contract tests (`12/12`), dashboard E2E (`8/8`), and responsive
visual capture (`1/1`) pass; final visual Oracle passes are clean. The full
workspace test gate remains blocked by twelve local PostgreSQL `28P01`
authentication failures, and full lint retains the known analytics fixture
diagnostics. Todo 14 and F1-F4 remain open until isolated full verification,
security review, evidence reconciliation, and protected-record handling are
resolved.

## Todo 14 Admin acceptance follow-up

The Admin acceptance test now verifies the authenticated `/auth/me` role shape
for a newly created Personal-scope Operator, in addition to Personal command
authorization and Business denial. Focused E2E passed `1/1`, the full
Playwright suite passed `12/12`, and typecheck, changed-file Biome, and
`git diff --check` passed. Disposable E2E artifacts and containers were
cleaned; the external QA Compose services remain intentionally running.

## Session follow-up: default Compose Admin bootstrap

The default Compose bootstrap regression is fixed and evidenced in
`.omo/evidence/compose-default-admin-bootstrap-2026-08-18.md`. The API image now
ships and applies migrations before accepting requests. Real Playwright Chromium
verified first Admin bootstrap (`201`) and authenticated dashboard login; a
repeat bootstrap returned `409` without creating another Admin. Focused test,
Biome, typecheck, workspace build, and default Compose rebuild passed. The full
workspace test command remains blocked by the known local PostgreSQL
authentication boundary; Todo 14 and F1-F4 remain open.

## Dashboard accessibility and responsive polish follow-up

The Todo 14 dashboard polish pass is implementation-complete in the current
uncommitted WIP: typed live-region semantics, async busy/disabled controls,
schedule Save/Cancel mutual exclusion, corrected responsive schedule filters,
and regression coverage are present. Focused contract tests passed `12/12`, the
full Playwright suite passed `12/12`, and responsive visual capture passed
`1/1` with `100/100` image diffs at 375/768/1280.

Closeout remains open. Full Vitest is blocked by twelve local PostgreSQL
`28P01` authentication failures; full Biome retains the two existing analytics
fixture diagnostics. The default and external QA Compose stacks must be
stopped, review lanes must report, and the protected plan/ledger modifications
must remain explicitly unresolved rather than being silently normalized.

## Review-fix and cleanup follow-up

The schedule detail race found by code review is fixed with a request-generation
guard in `apps/web/src/schedule-controller.ts`. A deterministic deferred-response
E2E regression passes, and the full Playwright suite passes `13/13`. The
dedicated regression covers rapid job selection; deterministic deferred scope
switch coverage remains a follow-up because the dashboard cancels the proxied
request during that transition.

The Compose API exposure finding is fixed: `api` is internal-only via
`expose: "3000"`, while only `web` publishes a host port. Compose boundary and
startup tests pass `3/3`, configuration validation passes, and the post-fix
security review has no remaining blockers.

Current final gates: workspace build, typecheck, targeted Biome, visual capture,
full Playwright, and `git diff --check` pass. Full Vitest remains blocked by
`12` PostgreSQL `28P01` failures; full Biome retains the two existing analytics
fixture diagnostics. Both RelayNest Compose QA projects and their containers
were stopped without volume deletion; `test-results` and `.tmp/playwright` are
absent. Protected plan/ledger mutations remain unresolved, so Todo 14 and F1-F4
must stay open until authorized/reconciled.

## Final scope-generation review

The schedule controller now invalidates detail generations at effect start,
synchronously on session selection, and for every detail request. Final Oracle
review returned PASS with no code-level blocker. The deterministic race E2E
continues to cover rapid job selection; a deferred scope-switch browser test
was not retained because the proxied request is canceled by the browser during
that transition. Existing full E2E scope/authorization coverage remains green.

The implementation slice is verified. Repository closeout remains open for the
protected plan/ledger authorization issue, PostgreSQL `28P01` full-test
boundary, two full-lint analytics-fixture diagnostics, unavailable bundled WAHA,
and incomplete Todo 14/F1-F4 acceptance gates.
