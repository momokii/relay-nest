# Todo 13 verification evidence

Date: 2026-08-28
Scope: aggregate and per-session analytics projections

## Changed surface

- `apps/api/src/analytics/types.ts`
- `apps/api/src/analytics/projection.ts`
- `apps/api/src/analytics/projection-metrics.ts`
- `apps/api/src/analytics/status-history.ts`
- `apps/api/src/analytics/runtime.ts`
- `apps/api/src/analytics/service.ts`
- `apps/api/src/analytics/http.ts`
- `apps/api/src/app.ts`
- `tests/task-13-baseline.test.ts`
- `tests/task-13-analytics.test.ts`
- `tests/task-13-analytics-fixtures.ts`
- `tests/task-13-analytics-projection.test.ts`
- `tests/task-13-analytics-operations.test.ts`
- `tests/task-13-analytics-http.test.ts`
- `tests/task-13-analytics-runtime.integration.test.ts`
- `tests/task-13-analytics-http.integration.test.ts`
- `tests/task-13-analytics-db-fixture.ts`

The workspace also contains unrelated pre-existing/concurrent changes outside
this list; they were not reverted or included as Todo 13 scope.

## Exact verification commands and outputs

Commands used the pinned toolchain:

```text
npx --yes pnpm@10.12.4 exec vitest run tests/task-13-*.test.ts
=> 5 passed, 2 skipped; 18 passed, 2 skipped (20 total)

npx --yes pnpm@10.12.4 typecheck
=> tsc -b --pretty false; exit 0

npx --yes pnpm@10.12.4 exec biome check apps/api/src/analytics tests/task-13-*.test.ts apps/api/src/app.ts
=> Checked 15 files; no fixes applied; exit 0 (includes db fixture)

npx --yes pnpm@10.12.4 build
=> config, domain, contracts, API, and web builds completed; exit 0

DATABASE_URL=<redacted disposable PostgreSQL URL> npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
=> migrations applied successfully

TASK13_DATABASE_URL=<redacted disposable PostgreSQL URL> npx --yes pnpm@10.12.4 exec vitest run tests/task-13-analytics-runtime.integration.test.ts
=> 1 passed; exit 0

TASK13_ANALYTICS_DATABASE_URL=<redacted disposable PostgreSQL URL> npx --yes pnpm@10.12.4 exec vitest run tests/task-13-analytics-http.integration.test.ts
=> 1 passed; exit 0

npx --yes pnpm@10.12.4 test
=> 49 passed, 5 failed, 15 skipped; 277 passed, 13 failed, 39 skipped (329 total)
```

The 13 full-suite failures are not Todo 13 regressions: 12 are the known
workstation PostgreSQL `kelanach` password-authentication failures, and one is
an unrelated concurrent release-document line-number expectation. Todo 13's
focused and isolated PostgreSQL checks pass.

The final review's identifier-correlation finding was fixed: acknowledgments now
match dispatch attempts to the payload message id, not the WAHA envelope id;
production-shaped distinct-id and orphaned-failure tests pass.

## Manual QA: live curl channel

Disposable resources: PostgreSQL 17.6 container `task13-analytics-manual-postgres`,
API port `33013`, PostgreSQL port `55440`. Credentials and cookie headers were
not written to this artifact.

Request:

```text
GET http://127.0.0.1:33013/health
```

Expected: HTTP 200 and `{"status":"ok"}`.

Request:

```text
POST http://127.0.0.1:33013/auth/bootstrap
Content-Type: application/json
{"email":"task13-admin@example.invalid","password":"<redacted>","displayName":"Manual Admin"}
```

Expected: successful bootstrap; response headers/body and cookie jar remain
private and redacted.

Request:

```text
curl -i -b <redacted-cookie-jar> 'http://127.0.0.1:33013/scoped/analytics?scope=personal'
```

Expected: HTTP 200; `scope=personal`, `messageVolume.total=0`,
`acknowledgments.unknown=0`, `sessions=[]`, `failureRate=null`, and
`uptimeMs=null`. The captured pre-fix response had the same zero-value fields
but reported `uptimeMs=0`; the focused post-fix test now verifies `uptimeMs=null`
for an empty scope.

Manual result: **PASS**. The first attempt used an unquoted zsh query URL and
failed before the request; no server state was left because the cleanup trap
ran. The corrected quoted request returned the redacted-safe response above.

## Adversarial probes

| Probe | Result |
|---|---|
| Malformed scope query | PASS: Zod boundary rejects it; route returns 400. |
| Malformed date query | PASS: focused HTTP test returns 400. |
| Malformed session UUID | PASS: Zod boundary rejects it; no projection values returned. |
| Cross-origin request | PASS: same-origin guard returns 403 without aggregate fields. |
| Unauthenticated request | PASS: route returns 401. |
| Cross-scope aggregate | PASS: authenticated Viewer receives empty Business aggregate, not Personal values. |
| Cross-session ungranted read | PASS: direct session query returns 403 without session data. |
| Partial acknowledgment | PASS: missing dispatch evidence is counted as unknown. |
| Out-of-order evidence | PASS: status history sorts by observed timestamp; duplicate messages choose deterministic earliest evidence. |
| HTTP acceptance / WORKING status as delivery | PASS: no route or projection converts either into recipient delivery. |
| Timelock/capping | PASS: indicators remain separate from acknowledgment and failure evidence. |
| Empty fixture | PASS: zero counts and unknown (`null`) uptime. |
| Dirty worktree | NOT PASS / observed: unrelated concurrent changes are present; no destructive cleanup was attempted. |
| Long command | PASS: focused and full commands completed within the bounded command timeout. |
| Flaky/timing-sensitive tests | PASS: deterministic fixtures; no sleeps in tests; isolated integration passed. |
| Misleading success output | PASS: full-suite failures are recorded rather than hidden. |
| Repeated interruption | NOT APPLICABLE: no long-running QA asset was spawned. |
| Prompt injection | NOT APPLICABLE: no prompt/LLM input is part of Todo 13. |
| Cancel/resume | NOT APPLICABLE: no resumable user workflow is part of this read-only projection. |

## Cleanup receipts

```text
docker ps --filter name=task13-analytics --format '{{.Names}}'
=> <no output>

ss -ltn '( sport = :55439 or sport = :55440 or sport = :33013 )'
=> no matching listening ports
```

The disposable PostgreSQL containers, API process, cookies, logs, IDs, and
temporary files were removed by traps/finalizers. Existing project containers
were not modified.

## Risks and limitations

- The default full suite cannot pass until the workstation PostgreSQL credential
  mismatch and unrelated concurrent release-document change are resolved.
- External scanners unavailable in this environment are not claimed as passed.
- Analytics reports transport evidence and operational state; it does not prove
  recipient receipt or human delivery.
