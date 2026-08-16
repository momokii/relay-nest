# Todo 6 evidence: typed WAHA adapter and runtime health checks

Date: 2026-08-16
Scope: server-side WAHA adapter/config/API modules, transport repository seam, WAHA contracts, tests, and this evidence file.

## Baseline

- `npx --yes pnpm@10.12.4 lint` — PASS at baseline.
- `npx --yes pnpm@10.12.4 typecheck` — PASS at baseline.
- `npx --yes pnpm@10.12.4 test` — PASS: 2 files, 5 passed, 2 skipped; 5 passed, 6 skipped.
- `npx --yes pnpm@10.12.4 build` — PASS.
- `npx --yes pnpm@10.12.4 audit --audit-level=high` — PASS: no known vulnerabilities.
- `git status --short --untracked-files=all` — unavailable: this workspace and its parents are not Git repositories.

## Implementation

- Added Zod contracts for the matrix endpoints: `/ping`, `/health`, `/api/server/version`, `/api/server/environment`, `/api/server/status`, and `/api/sessions`.
- Added `apps/api/src/waha/adapter.ts`: exact GET paths, server-only `X-Api-Key`, timeout and caller cancellation, response parsing, redacted typed failures, version/engine negotiation, and separate service/session health reporting.
- Added `apps/api/src/waha/errors.ts`: typed authentication, HTTP, malformed-response, timeout, cancellation, capability, timelock, and capping classifications. Upstream response bodies are never included in errors.
- Added `apps/api/src/waha/url-policy.ts`: HTTP(S)-only validation, no credentials/query/fragment, private/loopback/link-local IPv4/IPv6 rejection, and explicit `waha`/`waha.internal` bundled references.
- Added `apps/api/src/waha/config.ts`: Admin-only runtime settings, public redaction, and AES-256-GCM persistence through the existing envelope cipher and transport repository seam.
- Extended `wahaConnections` repository access with `findById`, `findActive`, and typed `update`.
- Changed-file pure LOC: adapter 172, config 104, errors 71, URL policy 53, transport repository 101, config index 22, contracts 53, tests 200; no changed source file exceeds 250 pure LOC.

## Test-first and focused verification

- Red phase: `npx --yes pnpm@10.12.4 exec vitest run tests/waha-adapter.test.ts` — failed at missing adapter module, before implementation.
- Focused adapter tests: `npx --yes pnpm@10.12.4 exec vitest run tests/waha-adapter.test.ts --reporter=dot` — PASS: 9/9.
- Repeated focused run (two consecutive invocations) — PASS: 9/9 each; no flaky result.
- Focused changed-file Biome check — PASS.
- `npx --yes pnpm@10.12.4 typecheck` — PASS.
- `npx --yes pnpm@10.12.4 test` — PASS: 5 files, 21 passed, 2 skipped; 27 total tests, 6 skipped.
- `npx --yes pnpm@10.12.4 build` — PASS for all workspace packages.
- `npx --yes pnpm@10.12.4 audit --audit-level=high` — PASS: no known vulnerabilities.
- `docker compose -f docker-compose.external-waha.yml config` with `WAHA_BASE_URL=https://waha.example.com` — blocked by the pre-existing skeleton: service `api` has neither image nor build context.
- `docker compose -f docker-compose.bundled-waha.yml config` — blocked by the same pre-existing incomplete Compose skeleton.

Coverage includes success and exact path/header assertions, 401 redaction, malformed response, stale version, unsupported engine, 463 timelock, 475 capping, timeout, caller cancellation, unsafe URL rejection, bundled/external URL support, Admin-only settings, and encrypted credential persistence. No restart path or automatic restart loop exists in the adapter.

## Manual local mock QA

Disposable mock: Node HTTP server on `127.0.0.1:18081`, exact `/health` and `/api/server/version` paths, stopped by trap after checks. No external WAHA instance was available; this evidence makes no live-WAHA behavior claim.

Commands:

```text
curl -i --fail-with-body --max-time 5 -H 'X-Api-Key: manual-secret' http://127.0.0.1:18081/health
curl -i --fail-with-body --max-time 5 -H 'X-Api-Key: manual-secret' http://127.0.0.1:18081/api/server/version
npx --yes pnpm@10.12.4 exec vitest run tests/waha-adapter.test.ts --reporter=dot
```

Observed:

- `/health`: `HTTP/1.1 200 OK`, body `{"status":"ok"}`.
- `/api/server/version`: `HTTP/1.1 200 OK`, body reported version `2026.8.1`, engine `WEBJS`, and worker `mock-worker`.
- Adapter repository entrypoint: 9/9 passed.
- The key was sent in the curl request header only; it did not appear in adapter result/error output or browser-facing data.

## Adversarial checks and cleanup

- `malformed_input`: Zod rejects non-contract response shapes and URL parser rejects malformed/unsupported URLs.
- `prompt_injection`: external response fields are parsed as data; no response field is executed or interpolated into an error.
- `stale_state/version drift`: pinned `2026.8.1` and known engines are required before capabilities are reported.
- `dirty_worktree`: Git inspection was unavailable because no repository exists at the workspace or parent path.
- `generated_artifact`: build output is under ignored `**/dist/`; no source/generated migration file was edited by this task. Existing unrelated auth files and migration metadata caused aggregate lint interference and were not changed.
- `long_command/timeouts`: timeout is bounded and tested at 10ms; no unbounded retry or restart loop exists.
- `misleading_success_output`: tests record every request and assert exact method/path/header for all six health endpoints.
- `repeated_interruptions/cancellation`: caller abort is deterministic and classified separately from timeout; focused tests passed twice.
- Cleanup receipt: mock process stopped, its `/tmp/opencode/task-6-waha-mock.log` removed by trap, and no evidence/temp output was left outside this file.

## Earlier aggregate lint limitation

An earlier full `npx --yes pnpm@10.12.4 lint` run was affected by unrelated auth and migration files that appeared after the baseline. The changed WAHA/config/contracts/test files pass the targeted Biome check. No `.omo` plan state or ledger was edited.

## Verifier blocker remediation

- Added the machine-checked `environment` capability row for `GET /api/server/environment`; `python3 scripts/check_waha_capability_matrix.py docs/waha-capability-matrix.md` — PASS: 16 mandatory capabilities.
- Added `apps/api/src/waha/environment.ts` with an explicit safe scalar allowlist (`NODE_ENV`, `TZ`, `LANG`). Secret-like upstream fields such as API keys, passwords, tokens, and host metadata are excluded before health output.
- Added regression coverage for secret-bearing environment responses and raw-body redaction, plus `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::ffff:127.0.0.1`, and `::ffff:10.0.0.1`. `allowLoopback` permits only explicit loopback addresses; private/link-local/metadata ranges remain rejected.
- Focused adapter tests ran three consecutive times — PASS: 9/9 each.
- Final `npx --yes pnpm@10.12.4 typecheck` — PASS.
- Final `npx --yes pnpm@10.12.4 test` — PASS: 20 passed, 8 skipped.
- Final `npx --yes pnpm@10.12.4 build` — PASS.
- Final `npx --yes pnpm@10.12.4 audit --audit-level=high` — PASS: no known vulnerabilities.
- Final changed-file Biome and TypeScript no-excuse checks — PASS.
- Final full `npx --yes pnpm@10.12.4 lint` — blocked only by unrelated generated metadata formatting in `apps/api/drizzle/meta/0002_snapshot.json` and `apps/api/drizzle/meta/_journal.json`; neither was edited due to scope.
- Final mock QA on `127.0.0.1:18082`: `curl -i` `/health` and `/api/server/version` returned 200 with exact paths; adapter test entrypoint passed 9/9. Trap stopped the mock and removed `/tmp/opencode/task-6-waha-mock-final.log`.
