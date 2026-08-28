# Todo 10 release verification matrix

Date: 2026-08-27  
Repository: RelayNest  
Branch: `main`  
Verified HEAD: `113efd07c91ed828127560e0428528b8cc12f976`  
Remote parity: `HEAD == origin/main`  
Worktree receipt: clean at the close of every contributing lane

## Verdict

**VERIFIED WITH BLOCKERS AND LIMITATIONS.** The available PostgreSQL, browser,
static, Compose, and release checks were run from the target commit. The result
is not an all-green release claim. Full lint is blocked by six known diagnostics,
the exact bundled WAHA image is unavailable, and several real-provider or
browser-level recovery paths remain partial or unverified.

## Status matrix

| Area | Status | Proven result and boundary |
|---|---|---|
| PostgreSQL migration and complete test matrix | PASS | Fresh `postgres:17.6-alpine`; migration exit `0`, 8 records; final `67 files, 321 tests, 0 failed, 0 skipped` |
| PostgreSQL initial selector run | PARTIAL, superseded | Initial omission caused `63` files passed, `2` skipped, `2` failed and `313` tests passed, `3` skipped, `5` failed. The five failures were intentional mutation cases, and the task-specific selector omission caused the skips. The complete-selector run superseded this partial result. |
| Playwright focused E2E | PASS | `20 passed, 0 failed, 0 skipped` |
| Playwright full relevant E2E | PASS | `20 passed, 0 failed, 0 skipped` |
| Immediate-send probe | PASS, safe rejection | Temporary read-only probe: `1 passed, 0 failed, 0 skipped`; provider rejection was observed without delivery proof |
| Browser worker restart recovery | PARTIAL | Persisted recovery-state rendering and unavailable restart behavior passed. Killing and restarting a real worker through the browser was not proven. |
| Browser double-submit protection | PARTIAL | Fresh idempotency keys and single-action paths passed. No dedicated browser double-submit or duplicate-dispatch test exists in this matrix. |
| Real AI approval path | PARTIAL | Fail-closed unavailable state passed with no approval or dispatch request. No suggestion was supplied, so real approval followed by not-sent behavior was not executable. |
| Browser backup/restore | UNVERIFIED | No dashboard backup E2E spec exists. Separate implementation/API evidence was not counted as browser proof. |
| Native WAHA dashboard parity | UNVERIFIED | The RelayNest product dashboard is implemented and tested at authenticated app seams, but native WAHA dashboard parity remains `Not implemented / no repository test`. |
| Real WAHA, linking, account safety, recipient delivery | UNVERIFIED | The E2E harness used deterministic in-process mock WAHA behavior and a disposable database. No real WAHA, WhatsApp account, linking, or recipient delivery was used. |
| Workspace and scripts typecheck | PASS | Workspace `typecheck` and scripts `tsc -p scripts/tsconfig.json --noEmit` exited `0`. |
| Release-scoped Biome | PASS | Checked 33 files, exit `0`, no fixes. |
| Ordered production build | PASS | Config, domain, WAHA contracts, API, and web build completed, exit `0`; the API emitted a non-fatal 2.0mb size warning. |
| High-severity dependency audit | PASS | Exit `0`, no known high-severity vulnerabilities reported. |
| Repository-local requirements, secret, scope, docs, whitespace checks | PASS | All listed checks exited `0`; `git diff --check` produced no output. |
| Full lint | BLOCKED | Exit `1`; six known analytics-fixture/workstation diagnostics remained. No fixer ran and no branch-caused failure was observed. |
| Merged Compose configuration checks | PASS | Base, base plus override, external, and bundled profile checks each exited `0`. |
| Compose boundary and tests | PASS | 11 Compose tests passed; API and WAHA stayed internal with web-only host publication. |
| Release suite | PASS after bounded rerun | First run had two default 5-second timeouts. The same 13-file suite passed `101/101` with `--testTimeout=15000`; package manifest tests passed `5/5`. |
| Exact bundled image and runtime | BLOCKED | `devlikeapro/waha:2026.8.1` had no registry manifest. No bundled startup, health, UID, linking, account-safety, or delivery claim is made. |
| External scanners | UNAVAILABLE | `gitleaks`, `markdown-link-check`, `lychee`, `semgrep`, and `osv-scanner` were unavailable and have no claimed result. |

## Reproduction record

The lane reports retained the following redacted commands and outcomes. Values
for database URLs, passwords, provider credentials, private URLs, message text,
and temporary paths are intentionally omitted.

### PostgreSQL lane

```text
npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
  exit 0; 8 migration records applied
npx --yes pnpm@10.12.4 exec vitest run --pool=forks --maxWorkers=1 --minWorkers=1
  67 files, 321 tests; 0 failed, 0 skipped; exit 0
```

The final run enabled the isolated database plus all discovered task database
selectors. The focused required matrix also passed at `48 files, 198 tests`.
Migration replay remained `8 -> 8`. The lane used a fresh, uniquely owned
`postgres:17.6-alpine` resource and did not contact WAHA or a provider.

### Playwright lane

```text
npx --yes pnpm@10.12.4 test:e2e -- --grep "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"
  20 passed, 0 failed, 0 skipped
npx --yes pnpm@10.12.4 test:e2e
  20 passed, 0 failed, 0 skipped
npx --yes playwright@1.55.1 test --config=<redacted temporary probe config>
  1 passed, 0 failed, 0 skipped
```

The harness used disposable PostgreSQL, an in-process deterministic/mock WAHA,
loopback API and web services, and no real provider or account. Authenticated
scope separation, schedule persistence and cancellation, safe immediate-send
rejection, notification masking, retention confirmation, race handling,
responsive behavior, and keyboard accessibility passed as recorded by the
lane. Provider rejection is not recipient-delivery proof.

### Static and release lane

The exact static command chain was:

```text
npx --yes pnpm@10.12.4 typecheck
npx --yes pnpm@10.12.4 exec tsc -p scripts/tsconfig.json --noEmit
npx --yes pnpm@10.12.4 lint
npx --yes pnpm@10.12.4 exec biome check scripts package.json biome.json tests/release-*.test.ts tests/release-checks-test-support.ts
npx --yes pnpm@10.12.4 build
npx --yes pnpm@10.12.4 audit --audit-level=high
npx --yes pnpm@10.12.4 run verify:requirements --plan .omo/plans/waha-command-center.md
npx --yes pnpm@10.12.4 run secret-scan
npx --yes pnpm@10.12.4 run verify:scope
npx --yes pnpm@10.12.4 run docs:check
GIT_MASTER=1 git diff --check
```

Workspace typecheck, scripts typecheck, release-scoped Biome, ordered build,
high-severity audit, requirements verification, repository secret scan, scope
verification, documentation check, and whitespace check passed. Full lint
remained blocked at exit `1`: six diagnostics consisted of the known
`tests/task-13-analytics-db-fixture.ts` organize-imports/format diagnostics and
workstation traversal permission diagnostics under system paths. The lane made
no formatter or fixer change.

The unavailable external tools were probed but not scored: `gitleaks`,
`markdown-link-check`, `lychee`, `semgrep`, and `osv-scanner`.

### Compose and release lane

The four merged configuration commands were:

```text
docker compose --env-file /dev/null -f docker-compose.yml config --quiet
docker compose --env-file /dev/null -f docker-compose.yml -f docker-compose.override.yml config --quiet
docker compose --env-file /dev/null -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config --quiet
docker compose --env-file /dev/null -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha config --quiet
```

All four exited `0`. Structural checks showed
API and WAHA with no host publication and internal target port `3000`, with web
as the only host-published service. The Compose suite passed `2 files, 11
tests`. Repository-local release commands passed, and the release suite passed
`101/101` after the explicit 15-second test timeout. The initial default timeout
attempt is retained as two timeouts, not hidden.

The exact release command chain was:

```text
npx --yes pnpm@10.12.4 run verify:requirements
npx --yes pnpm@10.12.4 run secret-scan
npx --yes pnpm@10.12.4 run verify:scope
npx --yes pnpm@10.12.4 run docs:check
npx --yes pnpm@10.12.4 run verify:requirements --plan .omo/plans/waha-command-center.md
npx --yes pnpm@10.12.4 exec vitest run tests/release-*.test.ts
npx --yes pnpm@10.12.4 exec vitest run tests/release-*.test.ts --testTimeout=15000
npx --yes pnpm@10.12.4 exec vitest run tests/release-package.test.ts
```

The exact bundled image manifest probe failed with no such manifest. The
credential-free exit-78 guard is a configuration safety boundary, not bundled
runtime health. The supported secret boundary remains unverified, so no bundled
runtime, linking, account-safety, or delivery result is claimed.

The exact image probes were:

```text
docker manifest inspect devlikeapro/waha:2026.8.1
  exit 1; no such manifest
docker pull devlikeapro/waha:2026.8.1
  exit 1; manifest unknown
```

## Cleanup and resource receipts

Dynamic project names, container IDs, volume names, ports, and temporary secret
paths were task-unique and are redacted. The cleanup operations used bounded,
task-scoped forms; no host-wide prune was run:

```text
docker compose --project-name <REDACTED_TASK_PROJECT> down --remove-orphans
docker rm -f <REDACTED_TASK_CONTAINER>
docker volume rm <REDACTED_TASK_VOLUME>
docker network rm <REDACTED_TASK_NETWORK>
```

The PostgreSQL interruption trap and Playwright harness teardown performed the
corresponding container/volume/process cleanup; the Compose lane used
label-scoped audits and did not start a runtime. Dynamic identifiers are
intentionally not retained in this evidence.

- PostgreSQL lane: unique remaining containers `0`, volumes `0`, networks `0`;
  final task-owned host port free; repository temporary artifacts absent;
  unrelated Docker resources preserved.
- Playwright lane: no listener remained on loopback ports `4173` or `4317`; no
  `relaynest-e2e-postgres-*` container remained; `.tmp/playwright`, Playwright
  probe results, screenshots, and traces were absent.
- Static lane: no task-owned process remained; final `dist`, `.tsbuildinfo`,
  `test-results`, `playwright-report`, and `.tmp` artifacts were absent after
  targeted ignored build metadata cleanup.
- Compose lane: temporary mode-600 placeholder secret files and uniquely
  prefixed captures were removed; label audits found zero containers, volumes,
  and networks for both the default RelayNest project and the Todo 10 project
  label. No broad prune was used, and non-disposable volumes were preserved.
  The pre-existing ignored `test-results/.last-run.json` was not modified or
  deleted because this lane did not run browser E2E.

## Immutability and redaction receipts

- Each contributing lane reported a clean worktree at closeout and no commit or
  push. The reports were run against `main` with the target HEAD and remote
  parity recorded above.
- No source, tests, package scripts, Compose files, Dockerfiles, README or
  documentation, protected plan, or execution ledger was changed by the QA
  lanes.
- The PostgreSQL lane restored 11 pre-existing tracked E2E evidence files after
  an early broad attempt regenerated them; the final complete run left no
  changes.
- Captured evidence retains statuses, counts, exit codes, safe rule names, and
  resource counts only. Passwords, database URLs, provider tokens, secret
  values, private URLs, message text, raw logs, and temporary probe source are
  excluded.

## Remaining gates

Todo 10 is verified with the blockers and limitations above. Todo 11 and final
gates F1, F2, F3, and F4 remain open. Todo 8 and Todo 15 remain blocked on the
exact bundled image and a supported runtime secret boundary. This artifact does
not mark the whole plan complete and does not claim full lint, real provider
delivery, bundled WAHA startup or health, real AI approval, browser worker
recovery, browser backup/restore, or unavailable external scanners.
