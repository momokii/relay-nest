# Todo 14 Backend Verification Rerun

Date: 2026-08-17
Scope: fresh isolated PostgreSQL verification for the current Todo 14 backend
worktree. No production source, UI, Compose configuration, protected plan,
ledger, or state file was edited by this rerun.

## Result

**PASS for the requested focused backend verification wave.** The DB-gated
wave ran against a fresh `postgres:17.6-alpine` container on host port 55434
with both Todo 14 database variables set to the same isolated URL. No DB-gated
test was skipped, and no assertion, migration, or ambient-database failure was
observed.

This is not a claim that the full repository suite, full lint, dependency
security review, or Todo 14 completion passed.

## Exact final counts

| Check | Files | Passed | Skipped | Failed | Exit |
|---|---:|---:|---:|---:|---:|
| DB-gated authenticated wave | 10 | 25 | 0 | 0 | 0 |
| Focused non-DB/unit wave with DB baseline enabled | 9 | 52 | 0 | 0 | 0 |
| Workspace TypeScript typecheck | n/a | n/a | n/a | 0 | 0 |
| Changed-file Biome | 26 | n/a | n/a | 0 | 0 |
| API package build | n/a | n/a | n/a | 0 | 0 |
| `git diff --check` | n/a | n/a | n/a | 0 | 0 |

The evidence Markdown file itself is ignored by the repository Biome
configuration; a post-write `biome check .omo/evidence/task-14-backend-rerun.md`
therefore processed 0 files and exited 1. This is not counted as a source/test
failure, and the 26-file changed Todo 14 source/test check above passed.

The initial unit command without the legacy `RUN_POSTGRES_TESTS=1` flag
reported 50 passed and 2 skipped in `task-12-baseline.test.ts`. That file was
immediately rerun with its required disposable `DATABASE_URL` and flag (2/2
passed), then the complete focused-unit command was rerun and produced the
final 52 passed / 0 skipped result above. No skip was accepted as a passing
substitute for a missing database environment.

## Redacted commands and coverage

All commands used `npx --yes pnpm@10.12.4`. Passwords and complete database
URLs are intentionally omitted.

```text
docker run -d --name task14-backend-rerun-postgres \
  -e POSTGRES_DB=waha_command_center -e POSTGRES_USER=task14 \
  -e POSTGRES_PASSWORD=<REDACTED> -p 55434:5432 postgres:17.6-alpine

DATABASE_URL=<REDACTED_ISOLATED_URL> \
  npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
Result: PASS; migrations applied.

TASK14_DATABASE_URL=<REDACTED_ISOLATED_URL> \
TASK14_AUTH_SESSION_DATABASE_URL=<REDACTED_ISOLATED_URL> \
TASK5_AUTH_DATABASE_URL=<REDACTED_ISOLATED_URL> \
TASK11_DATABASE_URL=<REDACTED_ISOLATED_URL> \
  npx --yes pnpm@10.12.4 exec vitest run \
    tests/auth-http.integration.test.ts \
    tests/waha-session.test.ts tests/waha-session-http.test.ts \
    tests/waha-session-adapter.test.ts \
    tests/task-14-auth-session.integration.test.ts \
    tests/task-14-schedule-contracts.integration.test.ts \
    tests/task-14-schedule-adversarial.integration.test.ts \
    tests/task-14-ai-approval-contract.integration.test.ts \
    tests/task-14-retention-http.integration.test.ts \
    tests/task-11-notifications-http.integration.test.ts
Result: 10 files, 25 passed, 0 skipped, 0 failed.

RUN_POSTGRES_TESTS=1 DATABASE_URL=<REDACTED_ISOLATED_URL> \
TASK14_DATABASE_URL=<REDACTED_ISOLATED_URL> \
TASK14_AUTH_SESSION_DATABASE_URL=<REDACTED_ISOLATED_URL> \
TASK5_AUTH_DATABASE_URL=<REDACTED_ISOLATED_URL> \
TASK11_DATABASE_URL=<REDACTED_ISOLATED_URL> \
  npx --yes pnpm@10.12.4 exec vitest run \
    tests/task-14-ai-approval-http.test.ts tests/messaging.test.ts \
    tests/messaging-http.test.ts tests/messaging-safety.test.ts \
    tests/messaging-resolution.test.ts tests/scheduler.test.ts \
    tests/task-11-notifications.test.ts tests/task-12-retention.test.ts \
    tests/task-12-baseline.test.ts
Result: 9 files, 52 passed, 0 skipped, 0 failed.

npx --yes pnpm@10.12.4 typecheck
Result: PASS.

npx --yes pnpm@10.12.4 exec biome check <26 Todo 14 changed files>
Result: 26 files checked; no fixes applied.

npx --yes pnpm@10.12.4 --filter @waha-command-center/api build
Result: PASS; API TypeScript compile and esbuild bundle completed.

git diff --check
Result: PASS; clean output.
```

The DB-gated file-level results were:

- `auth-http.integration.test.ts`: 3 passed.
- `waha-session.test.ts`: 4 passed.
- `waha-session-http.test.ts`: 1 passed.
- `waha-session-adapter.test.ts`: 1 passed.
- `task-14-auth-session.integration.test.ts`: 2 passed.
- `task-14-schedule-contracts.integration.test.ts`: 6 passed.
- `task-14-schedule-adversarial.integration.test.ts`: 4 passed.
- `task-14-ai-approval-contract.integration.test.ts`: 1 passed.
- `task-14-retention-http.integration.test.ts`: 2 passed.
- `task-11-notifications-http.integration.test.ts`: 1 passed.

## Adversarial observations

- **Schedule:** cross-session job IDs were denied without disclosure; malformed
  UUID/scope/edit input returned the generic invalid-request result; missing or
  invalid CSRF and foreign Origin were denied before mutation; terminal jobs
  remained locked. The split contract and adversarial files both passed.
- **AI approval:** malformed suggestion ID/scope/body, missing or invalid CSRF,
  and foreign Origin were rejected generically; denied-scope and Viewer paths
  were denied; configured/unavailable provider states remained explicit; the
  approval result remained `not_sent` and made no dispatch call.
- **Auth/session:** unauthenticated and malformed login paths, secure session
  revocation, Admin-created users, explicit session grants, role checks, and
  Personal/Business scope separation passed. Provider unavailability remained
  a safe unavailable response without credential or connection-value leakage.
- **Retention:** preview-bound cancellation was non-destructive; confirmation
  required the bound preview and removed only the selected scoped category;
  cross-scope mutation was denied.
- **Notifications:** Admin-only settings/history/test behavior passed; disabled
  channels made zero provider calls; settings and failure history remained
  redacted and did not expose passwords, bot tokens, or provider response text.
- **Messaging/scheduler units:** immediate/scheduled messaging safety,
  consent/CSRF and idempotency protections, scheduler state/lease behavior,
  notification units, retention units, and content-free audit baseline passed.

## Cleanup receipt

```text
docker rm -f task14-backend-rerun-postgres
Result: exit 0; disposable container removed.

docker ps -a inspection
Result: task14-backend-rerun-postgres absent.

ss -ltn '( sport = :55434 )'
Result: no listener; port 55434 released.

docker ps inspection
Result: relaynest-dev-web-1, relaynest-dev-api-1, and
relaynest-dev-postgres-1 remained running (3/3); no Compose service was
started, stopped, or modified.
```

Temporary transcripts were held under `/tmp` only during verification and were
not added to the repository. No credentials, passwords, full URLs, message
content, generated identifiers, provider payloads, or secrets were written to
this evidence file.

## Limits

- No full repository test/lint claim is made.
- No real WAHA provider, real link, browser E2E, dependency audit, or security
  research claim is made by this backend rerun.
- Existing pre-rerun worktree changes, including protected state/plan/ledger
  changes, were preserved and not normalized by this task.
