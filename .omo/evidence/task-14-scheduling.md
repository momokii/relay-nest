# Todo 14 Wave 2 Task 3 — Authenticated Scheduling Contract

Date: 2026-08-17
Scope: scoped scheduled-job list/detail/edit/cancel over the durable scheduler.

## Contract

- `GET /scoped/sessions/:sessionId/messages/schedules?scope=...` returns only
  jobs for the authorized session and scope.
- `GET .../schedules/:jobId?scope=...` exposes persisted state, scheduled time,
  timezone, attempts, provider evidence, and recovery/failure classification.
- `PUT .../schedules/:jobId?scope=...` accepts only `scheduledFor` and `timezone`.
- `POST .../schedules/:jobId/cancel?scope=...` cancels only claimable,
  lease-free jobs; repeating cancellation of an already-cancelled job is safe.
- DTOs never include recipient phone, message, idempotency key, encrypted
  columns, lease owner, or WAHA credentials.

## Adversarial coverage

The route coverage is split into cohesive test modules, each below the 250 pure
LOC ceiling:

- `tests/task-14-schedule-fixtures.ts` — authenticated disposable database and
  schedule fixtures (111 pure LOC);
- `tests/task-14-schedule-contracts.integration.test.ts` — the existing six
  authenticated list/detail/edit/cancel, denial, and terminal-lock scenarios
  (150 pure LOC);
- `tests/task-14-schedule-adversarial.integration.test.ts` — direct adversarial
  authenticated assertions (111 pure LOC).

The schedule contract tests cover:

- authenticated Personal list and detail with persisted `unknown` /
  `lease_expired` recovery state;
- same-origin and CSRF-protected edit and cancel;
- Personal/Business scope denial and ungranted-session denial;
- missing-CSRF denial before mutation;
- response redaction checks for opaque/encrypted and content field names;
- terminal `submitted` edit/cancel locks;
- repeated cancel idempotency and persisted cancellation.

The direct adversarial assertions also prove:

- a job ID from another authorized session returns exactly `404 {"error":"not_found"}`;
- malformed UUID, scope, and edit body inputs return exactly
  `400 {"error":"invalid request"}`;
- missing CSRF, invalid CSRF, and cross-origin mutation return exactly
  `403 {"error":"forbidden"}` and leave the schedule `scheduled`;
- terminal edit and cancel return exactly `409 {"error":"schedule_locked"}`;
- recovery DTOs expose `unknown` / `lease_expired` and only the public schedule
  fields, with no message, recipient, idempotency, lease, opaque, or provider
  secret content.

Existing `tests/scheduler.test.ts` and scheduler repository integration coverage
remain the source for lease recovery and no-duplicate claim/dispatch behavior;
the HTTP adapter does not alter scheduler claim or settlement semantics.

## Verification transcript

All commands used the pinned toolchain `npx --yes pnpm@10.12.4`.

```text
npx --yes pnpm@10.12.4 exec biome check \
  tests/task-14-schedule-fixtures.ts \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-schedule-adversarial.integration.test.ts
Result: Checked 3 files. No fixes applied.

npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-schedule-adversarial.integration.test.ts
Result: 2 files, 10 passed (6 existing contract tests + 4 adversarial tests).

npx --yes pnpm@10.12.4 exec vitest run \
  tests/scheduler.test.ts tests/messaging-http.test.ts tests/messaging.test.ts
Result: 3 files, 18 passed.

npx --yes pnpm@10.12.4 --filter @waha-command-center/api build
Result: API tsc and esbuild succeeded; dist/index.cjs emitted.

npx --yes pnpm@10.12.4 typecheck
Result: Workspace TypeScript project references passed with exit code 0.
```

Fresh isolated PostgreSQL 17.6 disposable run:

```text
docker run -d --name task14-schedule-hardening ... postgres:17.6-alpine
DATABASE_URL=<redacted> npx --yes pnpm@10.12.4 \
  --filter @waha-command-center/api db:migrate
Result: migrations applied successfully.
TASK14_DATABASE_URL=<redacted> npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-schedule-adversarial.integration.test.ts
Result: 2 files, 10 passed; explicit status/body assertions passed for 404,
400, 403, and 409 outcomes.
Cleanup: `docker rm -f task14-schedule-hardening` ran from the EXIT trap; no
task-owned container or port remained.
```

No protected plan, ledger, boulder, state, Compose, commit, push, reset, or clean
operation was performed. No full-suite success is claimed.

## Risks and limits

- The edit contract intentionally changes schedule timing only; encrypted
  message/recipient fields remain server-side and untouched.
- No HTTP restart is performed by this adapter. Durable scheduler restart and
  lease recovery continue through the existing scheduler service/repository.
- The separate Todo 14 AI approval red contract remains outside this scheduler
  task and was not changed.
