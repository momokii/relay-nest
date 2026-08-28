# F3 real executable QA evidence

Date: 2026-08-28  
Repository: RelayNest  
Audit basis: authoritative executable receipts recorded in
`.omo/evidence/task-16-next-phases-release.md` and the referenced Todo 9-14
evidence files.

## Classification

**BLOCKED/PARTIAL — do not approve F3.**

The focused release E2E matrix and its implementation-level support checks are
green against disposable PostgreSQL and deterministic in-process mock WAHA.
Browser rendering and interaction coverage is also green for the exercised
paths. F3 remains partial because the evidence does not show a browser worker
kill/restart, a dedicated browser double-submit, browser backup/restore, or
approval from a real AI provider. Those gaps are recorded below rather than
being inferred from lower-level tests.

## Audit boundary and source of truth

- The Todo 10 release matrix was executed against the target `main` revision;
  the current source/test tree has not changed since that matrix. The current
  worktree contains pre-existing documentation/state/evidence changes and a
  pre-existing `.omo/boulder.json` deletion; this audit did not alter them.
- This session performed read-only repository/environment inspection and
  reconciled the existing executable receipts. It intentionally did not rerun
  the matrix because the isolated-resource receipts are complete and the
  workstation currently has unrelated running resources. No existing resource
  was contacted, stopped, removed, or cleaned.
- The recorded browser harness used disposable PostgreSQL, a disposable API
  and web process, Playwright Chromium, and deterministic in-process mock WAHA.
  It did not use real credentials, an external provider, a WhatsApp account, or
  recipient data.
- Browser assertions checked HTTP status/body contracts, visible DOM state,
  persistence, scope/CSRF behavior, and dispatch-request counters. Runner logs
  alone were not treated as proof.

## Exact executable receipts

The following commands and results are reproduced from the authoritative
release matrix. Database URLs, credentials, private URLs, message text,
temporary paths, and opaque IDs are redacted.

### Disposable PostgreSQL support matrix

```text
npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
exit 0; 8 migration records applied

npx --yes pnpm@10.12.4 exec vitest run --pool=forks --maxWorkers=1 --minWorkers=1
exit 0; 67 files, 321 tests; 0 failed, 0 skipped
```

The final run enabled the isolated database and all discovered task database
selectors. The focused required database matrix also passed with `48 files,
198 tests`. Migration replay remained `8 -> 8`. No WAHA or provider was
contacted.

### Focused and full relevant browser matrix

```text
npx --yes pnpm@10.12.4 test:e2e -- --grep "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"
exit 0; 20 passed, 0 failed, 0 skipped

npx --yes pnpm@10.12.4 test:e2e
exit 0; 20 passed, 0 failed, 0 skipped

npx --yes playwright@1.55.1 test --config=<REDACTED_TEMPORARY_PROBE_CONFIG>
exit 0; 1 passed, 0 failed, 0 skipped
```

Supporting focused browser receipts were:

```text
npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/schedule-dashboard.spec.ts tests/e2e/schedule-race.spec.ts \
  --reporter=line
exit 0; 3 tests passed

npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/dashboard.spec.ts --grep "notification|retention" --workers=1
exit 0; 3 tests passed

npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/dashboard.spec.ts \
  tests/e2e/task-14-admin-access.spec.ts \
  tests/e2e/schedule-dashboard.spec.ts \
  tests/e2e/schedule-race.spec.ts \
  tests/e2e/visual-capture.spec.ts --reporter=line
exit 0; 18 tests passed
```

The focused schedule browser run covered persisted list/detail, edit/cancel,
recovery rendering, terminal locks, scope isolation, CSRF/same-origin denial,
and stale-detail response protection. The notification/retention run covered
masked settings, disabled-channel state, history, preview cancellation,
category mismatch, CSRF/same-origin headers, and confirmed purge.

### Implementation/API support receipts

```text
npx --yes pnpm@10.12.4 exec vitest run tests/scheduler.test.ts --reporter=dot
exit 0; 1 file, 7 tests

npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-schedule-adversarial.integration.test.ts --reporter=dot
exit 0; 2 files, 10 tests; fresh disposable PostgreSQL
```

The scheduler and messaging receipts additionally record fresh isolated
PostgreSQL/mock-WAHA coverage for transactional claims, one attempt under two
workers, lease-expiry and missed-schedule recovery, timeout/unknown handling,
bounded transient retry and exhaustion, safety gates, idempotency, and exactly
one counted provider transport on a replayed job. These are implementation or
API proofs, not claims of recipient delivery.

The notification receipts record disabled Email/Telegram channels and disabled
category preferences producing zero provider calls, SMTP timeout retrying
exactly three times, permanent rejection making one attempt, masked settings,
and redacted failure history. The provider boundary was local/mock only.

The retention and backup receipts record authenticated Admin HTTP behavior:

```text
POST /admin/retention/personal/preview {"category":"messages"}
exit 0; HTTP 200; bounded count/cutoff/token projection

POST /admin/retention/personal/purge ... confirmed=false
exit 0; HTTP 409; no deletion

POST /admin/retention/personal/purge ... confirmed=true
exit 0; HTTP 200; selected rows deleted; audit accountability retained

POST /admin/backups/personal {}
exit 0; HTTP 200; encrypted format-2 envelope returned

POST /admin/backups/personal/restore
exit 0; HTTP 200; deleted test job restored

restore with a different key
exit 0; HTTP 400; generic invalid-backup response
```

The backup result is API/manual and PostgreSQL evidence. It is not browser
backup/restore evidence.

## Required scenario matrix

| Required behavior | Implementation/API proof | Browser proof | Disposition |
|---|---|---|---|
| One scheduled send | Scheduler/messaging integration replay counted one provider transport; transactional claim created one attempt. | Browser proved schedule persistence and controls, not a real browser-triggered worker dispatch. | **PASS implementation; PARTIAL browser** |
| Recovery states | Unit/integration coverage observed `unknown` provider-unavailable, `unknown` lease-expired, missed-schedule, and safety-gate states. | Persisted recovery state rendered visibly and stayed non-editable. | **PASS for observed states; PARTIAL for worker restart** |
| Bounded retries | Transient retry/backoff and terminal exhaustion were covered; notification timeout was bounded at three attempts. | No browser-specific retry loop was exercised. | **PASS implementation; not browser-proven** |
| Duplicate protection | Unique attempt/idempotency constraints, two-worker claim race, and replay/no-second-dispatch checks passed. | No dedicated browser double-submit or duplicate-dispatch test exists in this matrix. | **PASS implementation; PARTIAL browser** |
| Notification toggles | Disabled channels/categories produced zero provider calls; provider mocks covered retry/failure and redaction. | Admin settings/preferences/test state and masked projections passed. | **PASS deterministic/mock browser and API** |
| Confirmation-gated purge | Missing confirmation, stale/mismatched preview, scope checks, and confirmed scoped deletion passed through the API. | Preview cancellation, mismatch rejection, CSRF/same-origin, and matching confirmation passed. | **PASS deterministic browser and API** |
| Encrypted restore | AES-256-GCM restore recovered a deleted encrypted record; wrong-key/tamper/cross-scope and relational validation failed closed. | No dashboard backup/restore E2E exists. | **PASS API/implementation; UNVERIFIED browser** |
| AI `not_sent` | Approval contract and service proof retain `sendState=not_sent` and zero messaging/scheduler dispatch calls. | Deterministic opaque browser fixture observed approval result `not_sent` and zero non-GET messaging/dispatch requests. | **PASS deterministic fixture; real AI approval unverified** |

## Explicit non-claims

The following were not observed and are not claimed by this evidence:

- No real WAHA service, WhatsApp account, session linking, account-safety
  outcome, recipient delivery, SMTP provider, Telegram provider, or real
  provider communication.
- No browser worker process was killed and restarted through the dashboard.
- No dedicated browser double-submit race was executed.
- No approval from a real AI provider was executed; the `not_sent` result used a
  deterministic opaque fixture and a fail-closed unavailable-provider seam.
- No browser backup/restore flow was executed; restore proof is API/manual and
  PostgreSQL-based.
- No native WAHA dashboard parity or bundled-WAHA runtime health claim is made.

An HTTP submission, WAHA `WORKING` state, provider acceptance, or transport
acknowledgment is not recipient-delivery proof.

## Disposable-resource cleanup

The authoritative lane receipts recorded bounded, task-scoped cleanup forms;
identifiers are intentionally redacted:

```text
docker compose --project-name <REDACTED_TASK_PROJECT> down --remove-orphans
exit 0

docker rm -f <REDACTED_TASK_CONTAINER>
exit 0

docker volume rm <REDACTED_TASK_VOLUME>
exit 0

docker network rm <REDACTED_TASK_NETWORK>
exit 0
```

Recorded closeout results for the contributing lanes were:

- PostgreSQL: zero task-owned containers, volumes, and networks; task-owned
  host port free; no repository temporary artifact remained.
- Playwright: no task-owned API/WAHA fixture, browser state, screenshots,
  traces, `test-results`, or temporary Playwright directory remained; task
  ports were free.
- Static/release: no task-owned process or generated build metadata remained.
- Compose: label-scoped audits found zero task-owned containers, volumes, and
  networks; temporary mode-600 placeholder secret files were removed; no broad
  prune was used and unrelated resources were preserved.

This audit performed no cleanup command. A read-only workstation inspection
found unrelated pre-existing containers/listeners, which were intentionally
left untouched. Therefore this report claims cleanup of the recorded
disposable F3 lanes only, not a host-wide empty-resource state.

## Evidence-file validation

These checks were run after writing this report:

```text
npx --yes pnpm@10.12.4 run secret-scan
exit 0

npx --yes pnpm@10.12.4 run docs:check
exit 0

npx --yes pnpm@10.12.4 exec biome check .omo/evidence/final-e2e.md
exit 1; repository Biome configuration ignored this evidence path and processed 0 files
```

The Biome result is not counted as a pass or failure of application code; this
Markdown evidence path was not processed. A separate redaction-pattern check
found no database URL, credential assignment, private-key block, bearer token,
or provider secret in this file.

## Final disposition

The deterministic focused matrix is executable and materially covers scheduled
send behavior, recovery states, bounded retries, duplicate protection,
notification toggles, confirmation-gated purge, encrypted restore, and AI
`not_sent` at the implementation/API and, where stated, browser-fixture level.
The evidence is **BLOCKED/PARTIAL** for F3 because the missing browser-level
worker restart, dedicated browser double-submit, browser backup/restore, and
real-AI-provider approval proofs were not observed. No real-provider or
recipient-delivery conclusion may be drawn from this report.
