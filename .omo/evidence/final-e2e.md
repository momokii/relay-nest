# F3 Real Executable QA — executed (waha-finalize-15-16)

Date: 2026-09-11 (gate run same day)
Plan: `.omo/plans/waha-finalize-15-16.md` (F3)
Toolchain: Node v22.23.1, `npx --yes pnpm@10.12.4`, Playwright 1.55.1, Vitest 3.2.6.

## Gate status

**PASS (executed).** The filtered e2e matrix ran green 3 consecutive times against a
disposable stack, and the scheduler/backup assertion layer ran green against a
second disposable Postgres. No delivery or account-safety claim is made; WAHA
`WORKING`/HTTP 200 is not recipient-delivery proof.

## Disposable stack (e2e)

`E2E_DATABASE_URL` was unset, so `tests/e2e/global-setup.ts` provisioned per run:
throwaway `postgres:16-alpine` (`relaynest-e2e-postgres-<pid>`, random password,
loopback-only, `--rm`), API built and spawned on `127.0.0.1:4317` with
`APP_ENV=test` and a throwaway 32-byte master key, mocked WAHA fixture, web built
and served on `127.0.0.1:4173`. Production DB never contacted. Global teardown
SIGTERMed the API, stopped the container (auto-removed), shut the WAHA fixture
down, and removed `.tmp/playwright`.

## Primary command — exact invocations and results

The plan-literal form `pnpm test:e2e -- --grep "..."` does **not** filter on
pnpm 10.12.4 (the `--` is forwarded so Playwright ran unfiltered); that
invocation produced `23 passed (36.8s)` — a green full-suite run, recorded as
supporting evidence. The filtering equivalent used for the gate:

```text
npx --yes pnpm@10.12.4 test:e2e --grep \
  "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"

List proof:   playwright test --list --grep <same> → "Total: 10 tests in 3 files"
Run 1: PASS — 10 passed (32.6s), exit 0
Run 2: PASS — 10 passed (28.2s), exit 0
Run 3: PASS — 10 passed (27.1s), exit 0
Supporting:   pnpm test:e2e -- --grep <same> (unfiltered) — 23 passed (36.8s)
Zero flaky/retried tests across all runs (retries: 0 by config).
```

The 10 gate tests: schedule create/edit/cancel without dispatch, one-time
validation copy + mobile drawer focus, notification settings/test/history states,
masked notification hydration after reload, retention preview-gated purge,
mixed-state Send page rows + detail modal, cancel round-trip on scheduled/queued
only, confirmation-gated delete of terminal rows, pagination across combined
history, stale-detail race guard.

## F3 assertion mapping (all asserted by executed code)

| F3 assertion | Executable proof (run today, green) |
| --- | --- |
| One scheduled send | `dashboard.spec.ts` "creates, edits, and cancels a persisted Personal schedule without dispatch": API persists `state:"scheduled"` (HTTP 200, `jobId` UUID) and `expect(dispatchRequests).toBe(0)`; persisted row visible after reload. Exactly-once dispatch under worker contention: `tests/scheduler.test.ts` "dispatches a due job once when two workers claim concurrently" + `tests/repositories.integration.test.ts` "claims a due scheduled job atomically across concurrent workers" |
| Visible recovery states | `schedule-dashboard.spec.ts` "renders mixed-state rows on the Send page…": scheduled/queued/attempting/failed rows with correct tone; failed detail modal shows `State · failed` and full body. Restart recovery: `scheduler.test.ts` "turns an expired lease into visible unknown recovery on restart" |
| Bounded retries | `scheduler.test.ts` "keeps ambiguous provider failures visible and retries only within the bound" + "retries a bounded transient failure with exponential delay" |
| No duplicate dispatch | e2e `dispatchRequests === 0` on the cancel path; atomic claim tests above; cancellation after claim rejected ("rejects cancellation after a worker has claimed the job") |
| Notification toggles | `dashboard.spec.ts` "exercises authenticated notification settings, test, and history states" + "hydrates the masked notification settings projection after reload" (masked values, no plaintext) |
| Confirmation-gated purge | `dashboard.spec.ts` "requires retention preview before cancel or confirm and completes the scoped purge" + `schedule-dashboard.spec.ts` delete-only-on-terminal-rows behind confirmation |
| Successful encrypted restore | `tests/task-12-backup.test.ts` (8 passed, authenticated AES-256-GCM envelope) + `tests/task-12-backup.integration.test.ts` (7 passed with `RUN_POSTGRES_TESTS=1`): scope-crossing payload rejected before write, no partial restore on invalid reference, session safety settings export/restore round-trip, fixed row ceiling, single repeatable-read snapshot |
| 463/475 semantics | `scheduler.test.ts` "requires an explicit timezone and classifies WAHA safety failures": 463 → `waha_463` (capping), 475 → `waha_475` (timelock), preserved official recovery meanings |
| Restart survival (Compose) | Covered by Todo 8 evidence (`.omo/evidence/task-16-waha-finalize-15-16.md`): `docker compose -p relaynest … restart` then all services `healthy`; not re-run in F3 |

## Vitest assertion layer — exact invocation and results

Disposable Postgres `relaynest-f3-postgres-3034156` (`postgres:16-alpine`,
random password, loopback-only, port 33106), migrations applied via
`pnpm --filter @waha-command-center/api db:migrate`, then:

```text
DATABASE_URL=postgresql://relaynest_f3:<random>@127.0.0.1:33106/relaynest_f3 \
ENCRYPTION_MASTER_KEY=<throwaway 32-byte base64> RUN_POSTGRES_TESTS=1 \
npx --yes pnpm@10.12.4 exec vitest run \
  tests/scheduler.test.ts tests/repositories.integration.test.ts \
  tests/task-12-backup.test.ts tests/task-12-backup.integration.test.ts

scheduler.test.ts:                  7 passed
repositories.integration.test.ts:   9 passed (repeated: 3 green runs total)
task-12-backup.test.ts:             8 passed
task-12-backup.integration.test.ts: 7 passed (skipped without RUN_POSTGRES_TESTS=1)
```

Harness-config notes (not product defects): one earlier vitest invocation without
`ENCRYPTION_MASTER_KEY` failed 2 suites at module init
(`EnvelopeEncryptionError: encryption master key is missing or invalid`) and was
rerun with the key injected; the backup integration suite is skip-gated on
`RUN_POSTGRES_TESTS=1` and only counts after the flag is set.

## Adversarial results

- **Flake watch:** `repositories.integration.test.ts` "claims a due scheduled job
  atomically across concurrent workers" (historical duplicate
  `dispatch_attempts_job_attempt_unique` flake) executed 3× today — no
  recurrence.
- **Keyword coverage gap (recorded, not failed):** the grep is case-sensitive and
  lowercase `restart|outage|463|475|duplicate|backup` match no e2e test titles;
  those behaviors are executably covered in the vitest layer above, and the 502
  provider-unavailable session-restart assertions
  (`dashboard.spec.ts:733` "keeps session lifecycle commands confirmation-gated
  and provider outcomes explicit") ran green in the unfiltered 23-test suite the
  same day. `invalid recipient` likewise has no e2e title match; recipient
  validation is covered by the consent/validation copy e2e test and API-layer
  tests in the full suite.
- **Filter pitfall:** `pnpm test:e2e -- --grep` silently runs unfiltered on this
  pnpm version; the gate used the verified filtering form and pinned it with
  `--list` ("Total: 10 tests in 3 files") before executing.

## Cleanup (verified)

`docker stop relaynest-f3-postgres-3034156` (container was `--rm`) →
`docker ps -a` shows no `relaynest-e2e-postgres-*` or `relaynest-f3-postgres-*`
containers; `.tmp/playwright` removed by teardown; ports 4317/4173 released.
Pre-existing unrelated Compose stacks (`relaynest`, `relaynest-dev`) were not
touched. Raw logs retained in `/tmp/opencode/f3-e2e-*.log`, `f3-vitest-*.log`,
`f3-list-noDashDash.log` (no secrets; disposable passwords were random and
per-run).
