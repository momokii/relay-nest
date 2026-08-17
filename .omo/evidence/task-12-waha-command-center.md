# Todo 12 Evidence

Date: 2026-08-17

## Changed surface

- `apps/api/src/retention/contracts.ts` — fixed categories, typed policy input,
  deterministic UTC cutoff.
- `apps/api/src/db/repositories/retention.ts` and
  `apps/api/src/db/repositories/retention-operations.ts` — scoped policy
  metadata, preview, bounded repeat-safe purge, stale-preview rejection, and
  atomic content-free purge audit.
- `apps/api/src/retention/service.ts` and `apps/api/src/retention/http.ts` —
  Admin-only policy/preview/purge endpoints with scope, CSRF, origin, and safe
  errors.
- `apps/api/src/backup/format.ts` and `apps/api/src/backup/repository.ts` —
  authenticated AES-256-GCM scoped backup envelope, row-level scope validation,
  and PostgreSQL export/restore including encrypted notification settings.
- `apps/api/src/waha/sessions.ts` — content-free session lifecycle audit hooks.
- `apps/api/src/app.ts`, `apps/api/src/app-session-service.ts`,
  `apps/api/drizzle/0008_todo12_retention.sql`, and
  `apps/api/drizzle/meta/_journal.json` — composition and migration/index wiring.
- `tests/task-12-baseline.test.ts`, `tests/task-12-retention.test.ts`,
  `tests/task-12-backup.test.ts`, `tests/task-12-retention.integration.test.ts`,
  `tests/task-12-http.integration.test.ts`, and
  `tests/messaging-postgres.integration.test.ts` — characterization, unit,
  PostgreSQL, and authenticated HTTP coverage.
- `docs/operations.md`, `.claude/SECURITY_STANDARDS.md`,
  `.claude/ENVIRONMENT_GUIDE.md`, `docs/threat-model.md`, and `.claude/state/*` —
  operational, security, threat, and agent-state updates.

## Verification

The following commands were run before committing or pushing:

```text
npx --yes pnpm@10.12.4 exec vitest run tests/task-12-baseline.test.ts tests/task-12-retention.test.ts tests/task-12-backup.test.ts --reporter=dot
PASS: 2 files, 4 passed; baseline PostgreSQL file skipped without a database.

npx --yes pnpm@10.12.4 exec tsc -b --pretty false
PASS: zero output, exit 0.

npx --yes pnpm@10.12.4 exec biome check apps/api/src/backup apps/api/src/retention apps/api/src/db/repositories/retention.ts apps/api/src/app.ts tests/task-12-*.test.ts
PASS: checked 11 files, no fixes/errors.

docker run --name todo12-postgres ... postgres:16-alpine
DATABASE_URL=postgresql://todo12:todo12@127.0.0.1:55439/todo12 pnpm db:migrate
PASS: fresh migration chain including 0008_todo12_retention applied.

RUN_POSTGRES_TESTS=1 DATABASE_URL=postgresql://todo12:todo12@127.0.0.1:55439/todo12 pnpm exec vitest run tests/task-12-baseline.test.ts tests/task-12-retention.integration.test.ts --reporter=dot
PASS: 2 files, 5 passed.

TASK12_DATABASE_URL=... DATABASE_URL=... ENCRYPTION_MASTER_KEY=<valid 32-byte test key> pnpm exec vitest run tests/task-12-http.integration.test.ts --reporter=dot
PASS: 1 file, 1 passed; HTTP statuses were preview 200, cancel 409, confirm 200, origin 403, malformed 400, cross-scope 409.
Post-review regression probes additionally returned 409 for an altered cutoff
with a valid preview token and rejected an embedded cross-scope backup row.

DATABASE_URL=... TASK5_AUTH_DATABASE_URL=... TASK11_DATABASE_URL=...
TASK12_DATABASE_URL=... RUN_POSTGRES_TESTS=1 ENCRYPTION_MASTER_KEY=<valid key>
npx --yes pnpm@10.12.4 test --reporter=dot
PASS: 31 files, 120 passed. Repeated against a newly recreated isolated
PostgreSQL database: 31 files, 120 passed again. `vitest.config.ts` sets
`fileParallelism: false`, serializing DB-mutating test files while preserving
the dedicated two-independent-pool concurrency test inside its file.

After the standard runs, the focused Todo 12 suite passed `10/10` twice. The
dedicated repository/messaging concurrency matrix was then rerun on a fresh
separate PostgreSQL instance and passed `10/10` twice. Reusing a database after
the full suite is not accepted as an isolation proof because encrypted fixtures
and prior rows can contaminate later tests.

Sequential isolated PostgreSQL checks after the retention extraction:
`tests/repositories.integration.test.ts` 9/9, `tests/messaging-postgres.integration.test.ts`
1/1, `tests/auth-migration.integration.test.ts` 1/1, `tests/auth-http.integration.test.ts`
3/3, Todo 12 baseline/retention/http 6/6.

The auth HTTP fixture now supplies a typed in-process WAHA client for the
authorized session-read path and a separate unavailable client. Two sequential
isolated-PostgreSQL runs both passed `tests/auth-http.integration.test.ts`
3/3, with authorized Personal session read HTTP 200 and genuine unavailable
client read HTTP 502 (`{"error":"WAHA unavailable"}`).

Final verification after the independent-worker fixture and documentation
updates:

```text
Todo 12 focused suite, run 1: 5 files, 10 passed.
Todo 12 focused suite, run 2: 5 files, 10 passed.
Repository/messaging concurrency matrix, run 1: 2 files, 10 passed.
Repository/messaging concurrency matrix, run 2: 2 files, 10 passed.
Sequential integration matrix: repositories 9/9, messaging 1/1,
Todo 11 notification/baseline 3/3, auth migration 1/1, migration replay 1/1.
Non-integration suite: 24 files, 101 passed.
Sequential post-fixture rerun: Todo 11 baseline 2/2, notifications 1/1, auth
migration 1/1, auth HTTP 3/3 twice, migration replay 1/1. A combined
multi-file invocation was discarded because its shared database caused
cross-file truncation interference; no combined result is claimed.
```

The root build script was corrected to build workspace declaration packages
before API/web packages; `pnpm build`, `pnpm typecheck`, `pnpm lint`, and
`pnpm audit --audit-level=high` then passed. `docker compose config`,
`GIT_MASTER=1 git diff --check`, and a local Markdown-link scan also passed.
`gitleaks`, `markdown-link-check`, `lychee`, and `docs:check` were unavailable
in the environment, so no external secret/link/docs scan was claimed.

pnpm --filter @waha-command-center/api build
PASS: TypeScript plus esbuild API bundle, exit 0.
```

## Exact real manual QA

The disposable API ran at `http://127.0.0.1:33012` against the named
`todo12-postgres` container. Admin bootstrap returned 201 and redacted the
password. A seeded Personal job and policy produced:

```text
POST /admin/retention/personal/preview {"category":"messages"} without CSRF
403 {"error":"forbidden"}

POST /admin/retention/personal/preview {"category":"messages"} with matching Origin/CSRF
200 {"accountScope":"personal","category":"messages","cutoff":"2026-07-18T04:25:21.845Z","count":1,"batchSize":100,"previewToken":"<redacted-uuid>"}

POST /admin/retention/personal/purge {"category":"messages","previewCount":1,"previewToken":"<preview-token>","confirmed":false}
HTTP 409 {"error":"confirmation_required"}

POST /admin/retention/personal/purge {"category":"messages","previewCount":1,"previewToken":"<preview-token>","confirmed":true}
HTTP 200 {"count":1,"batchSize":100,"deletedCount":1}
```

The exact authenticated curl commands used the cookie jar created by
`POST /auth/bootstrap`, its `waha_csrf` value in `x-csrf-token`, an explicit
matching `Origin: http://127.0.0.1:33012`, and the server-issued preview token.
Backup/restore was verified with:

```text
POST /admin/backups/personal
before=1
DELETE scheduled_jobs WHERE id='44444444-4444-4444-8444-444444444444'
after_delete=0
POST /admin/backups/personal/restore
{"restored":true,"accountScope":"personal"}
after_restore=1
```

The API was restarted with a different 32-byte key and the same backup was
submitted to restore:

```text
wrong_key HTTP 400
{"error":"invalid backup"}
```

Fresh manual scope proof: preview HTTP 200 with count 1; cancel HTTP 409 with
Personal jobs still 1; stale cutoff HTTP 409; matching confirm HTTP 200 with
deletedCount 1; post-purge counts were Personal jobs 0, Business jobs 1,
seeded audit rows 1, and purge audit rows 1. A new Personal backup then
produced `before=1`, direct delete `after_delete=0`, restore HTTP 200, and
`after_restore=1`; Business/audit counts remained `1/1`. Restarting the API
with an alternate key returned HTTP 400 `{"error":"invalid backup"}`.

## Scheduler concurrency regression proof

The repository integration fixture now creates two independent PostgreSQL
`createDatabase()` handles and repository instances before calling `claimDue`
concurrently. Against fresh PostgreSQL 17.6, the repository plus messaging
integration matrix passed twice:

```text
Run 1: 2 files, 10 passed; one non-null claim, one dispatch attempt.
Run 2: 2 files, 10 passed; one non-null claim, one dispatch attempt.
```

The winning claim persisted `state=attempting`, `attempts=1`, and a lease owner
matching `worker-a` or `worker-b`. Production `claimDue` remains unchanged and
continues to use one transaction with `FOR UPDATE SKIP LOCKED`.

## Documentation/state reconciliation

- Root `README.md` and `AGENTS.md` now identify the product as RelayNest and
  describe Todos 1-12, Todo 12 current status, scope, setup, security, tests,
  limitations, and protected planning records.
- `.claude/README.md`, `CURRENT_STATUS.md`, `TASK_QUEUE.md`, and
  `DECISIONS_LOG.md` now distinguish Todo 12 focused verification from pending
  whole-plan/F1-F4 gates and final branch synchronization.
- `.claude/AGENT_RULES.md` and `HOW_TO_RESUME.md` explicitly require refreshing
  state against verified source, tests, evidence, and worktree status.

Todo 12 was then recorded in the protected plan/ledger and committed locally as
`0043f62`, `dea87d3`, `f94ca0f`, and `ad08848`. Final remote synchronization is
pending the clean-tree and remote verification step.

Post-QA database probes returned `counts=1|0|3` for Personal jobs, Business
jobs, and Todo 12 purge/backup audit rows. The redaction probe returned
`redaction=0` for non-null audit details or opaque content in audit identity
fields.

## Adversarial classes

- Policy-only change: no deletion path is called.
- Confirmation cancellation: 409 and zero deletion.
- Exact count: preview and confirmation share cutoff/category/scope/batch;
  stale counts fail closed.
- Scope/category: Personal purge leaves Business rows; audit category never
  deletes accountability.
- Preview binding: purge requires the expiring server-issued preview token;
  altered cutoff/count/category/scope is rejected even when counts coincide.
- Repeated/interrupted purge: one bounded batch per transaction; repeated runs
  converge and transaction rollback preserves rows on failure.
- Auth matrix: Admin required; Viewer/Operator and cross-scope requests deny;
  explicit matching origin and CSRF are required for Todo 12 mutations.
- Backup: missing, wrong, malformed, tampered, and cross-scope envelopes fail
  closed; plaintext and master keys are absent from responses/logged audit data.
- External copies: documentation explicitly separates live purge from backup,
  snapshot, and archive expiry.

## Cleanup receipt

- API process stopped after manual QA and final verification.
- Named `todo12-manual-pg`, `todo12-auth-pg`, `todo12-final-pg`, and
  concurrency-verification containers removed with
  `docker rm -f`.
- Temporary `/tmp/todo12-*` cookies, headers, JSON responses, and logs removed.
- Generated `apps/api/dist`, `apps/web/dist`, workspace `dist` directories, and
  TypeScript build-info artifacts removed after final verification.
- Ports `33012`, `55439`, and `55440` are clear; no `todo12-*` container,
  temporary artifact, or QA process remains.

## Final acceptance follow-up

The intermittent fresh-DB messaging failure was reproduced against PostgreSQL
17.6. The isolated messaging file passed by itself, while the full suite
failed when earlier repository/retention files left deliberately opaque
ciphertext jobs due in the shared database; `claimDue()` correctly selected
one of those unrelated jobs and encryption correctly failed closed. The
Initially, the messaging test used a synthetic clock at `2030-01-01`, overlapping
those fixtures. The opaque repository and retention fixtures now transition to
 `cancelled` after their assertions, so they cannot be selected by a later
global scheduler claim. Its clock is now explicitly `2000-01-01`, before
unrelated opaque fixtures. No production claim or encryption behavior was
changed.

Three consecutive fresh PostgreSQL 17.6 standard runs passed after the fix:

```text
Run 1: 31 files, 120 passed.
Run 2: 31 files, 120 passed.
Run 3: 31 files, 120 passed.
```

Fresh follow-up matrices also passed:

```text
Todo 12 focused run 1: 5 files, 10 passed.
Todo 12 focused run 2: 5 files, 10 passed.
Repository/messaging concurrency run 1: 2 files, 10 passed.
Repository/messaging concurrency run 2: 2 files, 10 passed.
Auth migration/HTTP run 1: 2 files, 4 passed; authorized 200 and unavailable 502 covered.
Auth migration/HTTP run 2: 2 files, 4 passed; authorized 200 and unavailable 502 covered.
Migration replay: 1 file, 1 passed.
WAHA capability test: 1 file, 1 passed.
```

## Final isolated manual API QA

Fresh PostgreSQL 17.6 and API lifecycle: API `33012`, database port `55471`.
Bootstrap returned `201`; all tokens, keys, and backup envelope fields were
redacted from recorded output. Seeded one old Personal job, one old Business
job, one audit row per scope, and both message-retention policies.

```text
POST /admin/retention/personal/preview {"category":"messages"}
200 {"accountScope":"personal","category":"messages","cutoff":"2026-07-18T05:10:37.538Z","count":1,"batchSize":100,"previewToken":"<redacted>"}

POST /admin/retention/personal/purge confirmed=false
409 {"error":"confirmation_required"}; Personal jobs remained 1.

POST /admin/retention/personal/purge with stale cutoff and valid token
409 {"error":"preview_stale"}

POST /admin/retention/personal/purge with matching preview
200 {"count":1,"batchSize":100,"deletedCount":1}; Personal jobs became 0,
Business jobs remained 1, and audit accountability remained present.

POST /admin/backups/personal {}
200 {"format":"waha-command-center-backup","version":1,"accountScope":"personal","encrypted":true}
before=1; direct delete; after_delete=0
POST /admin/backups/personal/restore
200 {"restored":true,"accountScope":"personal"}; after_restore=1

API restart with a different exact 32-byte key and the original backup
400 {"error":"invalid backup"}
```

Final manual database counts before teardown: Personal jobs `1`, Business
jobs `1`, audit rows `7`. API process, PostgreSQL container, ports `33012` and
`55471`, `/tmp/todo12-*` files, generated `dist` directories, and TypeScript
build-info artifacts were removed. The first backup curl attempt was discarded
because it sent an empty body with `Content-Type: application/json`; the
corrected `{}` request is the accepted result above.

## Final quality gates

`pnpm lint`, `pnpm typecheck`, ordered `pnpm build`, `pnpm audit --audit-level=high`,
`GIT_MASTER=1 git diff --check`, base Compose config, external-WAHA overlay,
bundled-WAHA overlay, and local Markdown-link scan all passed. External
`gitleaks`, `markdown-link-check`, `lychee`, and `docs:check` remain unavailable
in the environment and are not claimed.

## Post-review correction rerun

The review identified fixture-state coupling and a documented preview CSRF
boundary mismatch. Opaque scheduled-job fixtures in the repository and
retention integration tests now transition to `cancelled` after their assertions;
the preview route now uses the same Admin + same-Origin + CSRF gate as purge and
backup routes, and the HTTP test asserts missing-CSRF preview returns `403`.
The durable decision history was restored before this rerun.

After those corrections, three consecutive fresh PostgreSQL 17.6 standard runs
passed with all integration variables enabled:

```text
Run 1: 31 files, 120 passed.
Run 2: 31 files, 120 passed.
Run 3: 31 files, 120 passed.
```

The focused Todo 12 suite passed twice after the correction: `5 files, 10
passed` each run. No production encryption or scheduler claim implementation
was changed.

## Final source-fix revalidation

The final source contains the explicit `2000-01-01T12:00:00.000Z` synthetic
clock in `tests/messaging-postgres.integration.test.ts`, with a concise comment
explaining that it stays before opaque fixtures from other integration files.
Fresh PostgreSQL 17.6 databases were migrated before every matrix:

```text
Standard full suite, run 1: 31 files, 120 passed.
Standard full suite, run 2: 31 files, 120 passed.
Standard full suite, run 3: 31 files, 120 passed.
Todo 12 focused, run 1: 5 files, 10 passed.
Todo 12 focused, run 2: 5 files, 10 passed.
Repository/messaging concurrency, run 1: 2 files, 10 passed.
Repository/messaging concurrency, run 2: 2 files, 10 passed.
Auth migration/HTTP, run 1: 2 files, 4 passed.
Auth migration/HTTP, run 2: 2 files, 4 passed.
Migration replay: 1 file, 1 passed.
WAHA capability test: 1 file, 1 passed.
```

`pnpm lint`, `pnpm typecheck`, ordered `pnpm build`, high-severity dependency
audit, all three Compose configs, and local Markdown-link validation passed.
Manual scope purge/backup/restore/wrong-key QA remains valid from the fresh
API/PostgreSQL lifecycle above because this source-only fixture correction does
not change production routes, encryption, or scheduler behavior.

## Review hardening revalidation

The independent review found and the implementation corrected four Todo 12
gaps: dispatch-attempt purge predicates now include account scope; backup outer
metadata is authenticated inside the AES-GCM ciphertext (format version 2);
backup export/restore uses an explicit allowlist, UUID keyset pages, 10,000-row
and 8 MiB transfer ceilings, 250-row restore chunks, and fail-closed relational
scope validation; and WAHA runtime connection create/update emits content-free
audit events through an optional typed callback. `session_messaging_safety` is
included in the backup allowlist. Invalid relational backup errors map to the
generic HTTP `400 invalid backup` boundary.

Fresh PostgreSQL 17.6 verification after the hardening fixes:

```text
Focused Todo 12/WAHA matrix: 5 files, 33 passed.
Full repository suite: 32 files, 134 passed.
Lint: 126 files checked, no fixes/errors.
Typecheck: exit 0.
Ordered workspace/API/web build: exit 0.
High-severity dependency audit: no known vulnerabilities found.
Compose base/external/bundled configurations: valid with non-secret placeholders.
Playwright smoke: 1 passed.
```

The full suite initially exposed two valid-fixture restore cases; the validator
was corrected to include audit-referenced users in exports and to require user
existence rather than a pre-existing role for global user references. The final
fresh run passed all `32 files / 134 tests`. The hardening commits are
`a8a4eb8`, `6cf4944`, `8e0294f`, and `a48b403`; state/evidence reconciliation is
the subsequent documentation commit.
