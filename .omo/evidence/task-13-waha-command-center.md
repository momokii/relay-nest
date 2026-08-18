# Todo 13 Analytics Projection Evidence

Date: 2026-08-17
Branch: `main` at `7e82650` before this task

## Scope

Implemented and independently hardened the existing aggregate/per-session
analytics seam only. The projection reports scoped message volume/direction,
acknowledgment evidence, failure/retry rates, status history and uptime,
timelock/capping indicators, contact activity, and scheduled-job outcomes.
It does not infer recipient delivery from missing events, HTTP 2xx, `WORKING`,
or submitted states.

## Changed files

- `apps/api/src/app.ts` — existing analytics route/source composition retained.
- `apps/api/src/analytics/types.ts` — preserves attempt/job timestamps and
  aggregate status/uptime fields in the internal analytics contract.
- `apps/api/src/analytics/projection.ts` — preserves the public projection
  interface while orchestrating scoped session metrics and aggregate output.
- `apps/api/src/analytics/projection-metrics.ts` — owns message, acknowledgment,
  job, safety, scope/window, and deterministic timestamp-ordered event helpers.
- `apps/api/src/analytics/runtime.ts` — authorizes session IDs before source
  reads, carries timestamps, includes prior status evidence for boundary
  uptime, and reads contact activity by creation or update time.
- `apps/api/src/analytics/status-history.ts` — keeps status ordering and
  boundary-clipped uptime behind a small module.
- `tests/task-13-analytics-fixtures.ts` — shared independent literal fixtures.
- `tests/task-13-analytics.test.ts` — service/grant seam coverage.
- `tests/task-13-analytics-projection.test.ts` — message, unknown, window, and
  deterministic duplicate-event projection coverage.
- `tests/task-13-analytics-operations.test.ts` — retries, uptime, status,
  safety, contacts, scheduled states, and scope isolation.
- `tests/task-13-analytics-http.test.ts` — HTTP boundary authentication,
  malformed query, same-origin, and empty aggregate cases.
- `tests/task-13-analytics-http.integration.test.ts` — real authenticated
  Admin/Operator/Viewer, scope, and per-session-grant surface coverage.
- `tests/task-13-analytics-db-fixture.ts` — encrypted normalized events and
  non-empty local job/attempt/contact fixture seeding.
- `tests/task-13-baseline.test.ts` — existing read authorization baseline.
- `.env.example` — safe valid base64 development encryption-key placeholder.

## Exact verification commands (redacted)

Focused projection/HTTP tests:

```text
npx --yes pnpm@10.12.4 exec vitest run tests/task-13-analytics.test.ts tests/task-13-analytics-projection.test.ts tests/task-13-analytics-operations.test.ts tests/task-13-analytics-http.test.ts tests/task-13-baseline.test.ts
```

Result: `16 passed` across five focused files.

Changed-file formatting and typecheck:

```text
npx --yes pnpm@10.12.4 exec biome check apps/api/src/analytics tests/task-13-analytics*.test.ts tests/task-13-baseline.test.ts apps/api/src/app.ts .env.example
npx --yes pnpm@10.12.4 typecheck
```

Result: both passed.

Disposable PostgreSQL and real authenticated HTTP surface:

```text
docker run -d --name task13-analytics-postgres -e POSTGRES_DB=waha_command_center -e POSTGRES_USER=task13 -e POSTGRES_PASSWORD=<REDACTED> -p 55432:5432 postgres:17.6-alpine
DATABASE_URL=postgres://task13:<REDACTED>@127.0.0.1:55432/waha_command_center npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
TASK13_ANALYTICS_DATABASE_URL=postgres://task13:<REDACTED>@127.0.0.1:55432/waha_command_center npx --yes pnpm@10.12.4 exec vitest run tests/task-13-analytics-http.integration.test.ts
docker rm -f task13-analytics-postgres
docker compose ps
```

Result: migration applied; real authenticated test `1 passed`; Compose API,
PostgreSQL, and web services remained up/healthy after cleanup.

The non-empty Personal response observed through the real route contained:
`messageVolume.total=1`, `outbound=1`, `acknowledgments.failed=1`,
`failureRate=1`, `retryCount=1`, `timelockIndicators=2`,
`contactActivity=1`, `uptimeMs=7200000`, and `scheduledJobs.failed=1,
retries=1`. Per-session output contained the Personal session and one message.

The same disposable migration and integration sequence was rerun after the
authorized-session source hardening; it again reported `1 passed`.

Build:

```text
npx --yes pnpm@10.12.4 build
```

Result: config, domain, WAHA contracts, API, and web builds passed.

Full suite:

```text
npx --yes pnpm@10.12.4 test
```

Result: `120 passed`, `23 skipped`, `12 failed` in four pre-existing database
integration files. The failures used the ambient workstation `DATABASE_URL`
and failed PostgreSQL authentication for user `kelanach`; no analytics test
failed.

## Manual QA and authenticated HTTP observations

The real Fastify surface was exercised through the test invocation above using
`app.inject` (not an external curl run), using the same
bootstrap/login/cookie/CSRF fixture conventions as the existing auth HTTP
integration tests. The test created Personal and Business sessions, created
Operator and Viewer users through the Admin route, granted only the Personal
session, and used the real database-backed `AuthService` and analytics source.

- Admin Personal session read: HTTP 200; only the Personal session ID appeared.
- Operator granted Personal session read: HTTP 200.
- Viewer granted Personal session read: HTTP 200.
- Viewer aggregate read for Business without a Business grant: HTTP 200 with
  an empty aggregate/session list and no Personal or Business session data.
- Viewer direct Business session read without a grant: HTTP 403; response did
  not contain the Business session ID or `messageVolume`.
- The encrypted non-empty Personal fixture produced the metrics listed above;
  no plaintext payload or credential appeared in the response/evidence.
- Malformed date, missing authentication, and cross-origin requests were
  rejected at the HTTP seam without aggregate output.

No raw cookies, passwords, encryption keys, message content, contact content,
provider payloads, or database URLs with credentials were stored here.

## Adversarial probes

- Malformed input: covered by invalid date and malformed direction fixtures;
  invalid direction is `unknown`; oversized HTTP windows are rejected.
- Stale/partial events: covered by missing direction, unknown acknowledgment,
  malformed status payload handling, and active status crossing `window.from`.
- Duplicate/out-of-order provider events: duplicate provider IDs count once;
  timestamp ordering is deterministic even when input order is reversed; status
  history and attempts are timestamp ordered.
- Incomplete acknowledgment evidence: failure rate is `null` whenever unknown
  acknowledgments remain in the denominator; it never presents a partial
  history as a complete delivery rate.
- Pre-query authorization: the source lists scoped sessions first and receives
  only authorized session IDs for event/job/contact decryption and reads.
- Dirty worktree: detected at start; pre-existing uncommitted Todo 13 files and
  `app.ts` changes were preserved, not reset or cleaned. Protected plan,
  ledger, boulder, and `.claude/state/*` files were not edited.
- Long commands: pinned `npx --yes pnpm@10.12.4` commands completed within the
  command timeout.
- Flaky tests: focused analytics and real HTTP tests passed; the ambient DB
  failures were deterministic authentication failures and were not masked.
- Misleading success output: unavailable LSP/scanner results are explicitly
  unclaimed below; full-suite failures are reported above.
- Prompt injection: N/A, no prompt-bearing input was triggered.
- Cancel/resume: N/A, no cancellation or resumed work protocol was triggered.
- Repeated interruptions: N/A, no interruption scenario was triggered.

## Cleanup receipts

- Removed disposable container `task13-analytics-postgres` with
  `docker rm -f`.
- Repeated the disposable-container cleanup after the final authorization
  hardening run.
- Verified `docker compose ps`; the existing `relaynest-dev` services remained
  running and healthy.
- Port 55432 was released with the disposable container.
- No temporary source, credential, dump, or debug files were created.
- Build output was generated only in existing ignored package `dist` paths.

## Unavailable checks and risks

- `lsp_diagnostics` was attempted for changed TypeScript files but the LSP MCP
  connection closed; no diagnostics pass is claimed.
- The repository TypeScript no-excuse script was not present at the documented
  path; no script pass is claimed.
- External scanners/documentation link checks were not run for this task; no
  result is claimed.
- Full-suite PostgreSQL integration remains blocked by the ambient workstation
  credential configuration. The disposable Todo 13 authenticated integration
  passed independently.
