# waha-finalize-15-16 - Work Plan

## TL;DR (For humans)
**What you'll get:** Two verified Compose deployments (external WAHA + bundled WAHA `latest-2026.8.1` digest-pinned) with non-root containers, secret-only credentials, health-gated startup, and a hardened Settings/Users UI, plus a full release sweep (lint/typecheck/test/e2e/audit/secret-scan) with evidence.

**Why this approach:** Keep WAHA as a pinned internal transport (Postgres owns scheduling), use Docker secrets for all keys so resolved Compose never leaks, and gate the final release on the exact `pnpm verify:requirements` + `secret-scan` gates already in the repo.

**What it will NOT do:** No multi-tenant SaaS, no public WAHA port, no browser-visible WAHA/master keys, no media/recurring/campaigns, no Redis queue, no `latest` unpinned image.

**Effort:** Large
**Risk:** High - unofficial WAHA ban risk, Compose secret wiring, and scheduler/encryption correctness gate the release.
**Decisions to sanity-check:** Pin `devlikeapro/waha:latest-2026.8.1` to its recorded digest (not the missing `2026.8.1` tag) and keep `127.0.0.1:8080` loopback default with explicit `WEB_BIND_ADDRESS` for LAN/VPN.

Your next move: approve this plan, then run `npx --yes pnpm@10.12.4 deploy:bundled` + full verification. Full execution detail follows below.

---

> TL;DR (machine): Large/High-risk finalize: pinned WAHA Compose (2 modes) + full release verification (lint/typecheck/test/e2e/audit/secret-scan).

## Scope
### Must have
- Dashboard-only external-WAHA Compose (`docker-compose.yml` + `docker-compose.override.yml` + `docker-compose.external-waha.yml`) and bundled-WAHA Compose (`+ docker-compose.bundled-waha.yml` + `--profile waha`) both `docker compose config` clean, health-gated, non-root, no host WAHA/API ports, secrets via `waha_api_key`/`encryption_master_key` files, digest-pinned `devlikeapro/waha:latest-2026.8.1` via `Dockerfile.waha` wrapper that reads `/run/secrets/waha_api_key` without interpolation.
- `README.md` + `docs/operations.md` + `.claude/state/*` updated to state loopback default, LAN/VPN `WEB_BIND_ADDRESS`, reverse-proxy TLS/firewall for public, and WAHA ban-risk mitigations (pacing, consent, quiet-hours, duplicate/burst, cooldown, capping, human approval).
- Users table keeps `min-width:880px` + `overflow-x:auto` + portaled `fixed` kebab (last row opens up) and reversible Enable; Settings is single-column full-width with 5 admin panels (Workspace, Live inventory, WAHA credentials, Quick control, Full data map admin-only).
- Recursive verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm audit --audit-level=high`, `pnpm secret-scan`, `pnpm verify:requirements`, `pnpm verify:scope`, `pnpm docs:check` all green; `.claude/state/CURRENT_STATUS.md`/`TASK_QUEUE.md`/`DECISIONS_LOG.md` current.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not publish WAHA `3000` or API `3000` to host, do not put `waha_api_key`/`ENCRYPTION_MASTER_KEY` in `.env`/`compose` interpolation/`docker compose config` output or browser storage/logs, do not use unpinned `latest`.
- Do not add media, recurring jobs, campaigns/broadcasts, full inbox parity, autonomous AI sending, multi-tenant SaaS, or Redis queue.
- Do not make `WORKING` or `HTTP 200` equal delivery proof; do not auto-retry timelock/capping unbounded.
- Do not add public registration or client-side auth decisions.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after for Compose/docs + TDD-adjacent for scheduler/encryption/auth (existing). Frameworks: Vitest (pool forks), Playwright (single-spec for Settings/Users), Biome, `tsc -b`, `pnpm audit`.
- Evidence: `.omo/evidence/task-15-waha-finalize-15-16.md` (Compose modes) + `.omo/evidence/task-16-waha-finalize-15-16.md` (full release) + `.omo/evidence/final-*.md` for F1-F4.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1: Todos 1-2 (Compose pinning + config validation + non-root/secret checks)
- Wave 2: Todos 3-4 (docs/ban-risk + state-file freshness)
- Wave 3: Todos 5-7 (lint/typecheck/test + Settings/Users regression + secret-scan)
- Wave 4: Todos 8-9 (e2e + audit) — final gate

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 2, 3 | 2 |
| 2 | 1 | 3, 4 | 1 |
| 3 | 1, 2 | 5 | 4 |
| 4 | 2 | 5, 6 | 3 |
| 5 | 3, 4 | 6, 7 | 6 |
| 6 | 5 | 7, 8 | 5 |
| 7 | 5 | 8 | 6 |
| 8 | 6, 7 | 9 | 7 |
| 9 | 8 | F1-F4 | - |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Pin WAHA image digest and harden Dockerfiles to non-root
  What to do / Must NOT do: Resolve `devlikeapro/waha:latest-2026.8.1` digest via `docker pull` + `docker inspect --format '{{index .RepoDigests 0}}'` and pin it in `Dockerfile.waha` (`FROM devlikeapro/waha@sha256:...`) — keep the dated `2026.8.1` wrapper as fallback but prefer `latest-2026.8.1` digest. Verify `Dockerfile.api` and `Dockerfile.web` run as `node` (non-root) and `USER node`. Must NOT use `latest` unpinned or `USER root`.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 2, 3
  References (executor has NO interview context - be exhaustive): `Dockerfile.waha:1` (`FROM` line), `Dockerfile.api:1`, `Dockerfile.web:1`, `docs/waha-capability-matrix.md:1` (pinned version), `docker-compose.bundled-waha.yml:1` (waha service)
  Acceptance criteria (agent-executable): `grep -q '@sha256:' Dockerfile.waha && docker build -f Dockerfile.waha --no-cache --pull -t tmp-waha:pinCheck . 2>&1 | tail -5` succeeds; `grep -q 'USER node' Dockerfile.api && grep -q 'USER node' Dockerfile.web`
  QA scenarios (name the exact tool + invocation): happy: `docker pull devlikeapro/waha:latest-2026.8.1 && docker inspect --format '{{index .RepoDigests 0}}' devlikeapro/waha:latest-2026.8.1` matches Dockerfile digest; failure: temporarily write `FROM devlikeapro/waha:latest` and assert `grep -q '@sha256:' Dockerfile.waha` fails. Evidence `.omo/evidence/task-15-waha-finalize-15-16.md`.
  Commit: N | no commit until explicitly requested

- [x] 2. Validate both Compose modes and secret wiring, no host WAHA/API ports
  What to do / Must NOT do: Run `docker compose -p tmp -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config` and `... -f docker-compose.bundled-waha.yml --profile waha config` and assert no `published: "3000"` for `api`/`waha`, only `web` publishes `${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080}:4173`, and `secrets:` entries exist for `waha_api_key`/`encryption_master_key` with `file: ${WAHA_API_KEY_FILE:?}` syntax. Check `docker compose config` output never contains `waha_api_key:` value or `ENCRYPTION_MASTER_KEY=` plaintext. Must NOT publish `waha` 3000 or interpolate secrets.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4
  References (executor has NO interview context - be exhaustive): `docker-compose.yml:65` (web ports), `docker-compose.bundled-waha.yml:1` (waha secrets/healthcheck), `docker-compose.override.yml:1` (encryption secret), `.env.example:1` (WEB_PORT/WEB_BIND_ADDRESS)
  Acceptance criteria (agent-executable): Both `docker compose config` invocations exit 0 and `docker compose -p tmp ... config | grep -q 'published' | grep -q '3000' | wc -l` equals 1 (only web) and `grep -q 'waha_api_key' docker-compose.bundled-waha.yml`
  QA scenarios (name the exact tool + invocation): happy: `docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha config > /tmp/cfg.yaml && ! grep -q '3000:3000' /tmp/cfg.yaml`; failure: inject `ports: ["3000:3000"]` into `api` and assert the published-count check fails. Evidence `.omo/evidence/task-15-waha-finalize-15-16.md`.
  Commit: N | no commit until explicitly requested

- [x] 3. Refresh operational docs and README ban-risk guidance
  What to do / Must NOT do: Update `README.md:1` (scope + Docker deployment one-click bundled/external) and `docs/operations.md:1` (Compose modes, file/port rules, secret file precedence) to state loopback default, `WEB_BIND_ADDRESS` for LAN/VPN, reverse-proxy TLS/firewall for public, and the WAHA ban-risk paragraph with mitigations (pacing, budgets, quiet hours, duplicate/burst, cooldown, timelock/capping, human approval). Mirror to `.claude/state/DECISIONS_LOG.md` if needed. Must NOT promise account safety.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `README.md:1` (Scope/Architecture/Docker deployment), `docs/operations.md:1` (Compose deployment modes + File and port rules), `docs/decisions/0001-product-boundary.md:68` (Network), `.claude/state/DECISIONS_LOG.md:1`
  Acceptance criteria (agent-executable): `grep -q 'loopback by default' docs/operations.md && grep -q 'reverse-proxy.*TLS' docs/operations.md && grep -q 'ban risk' README.md`
  QA scenarios (name the exact tool + invocation): happy: `pnpm docs:check 2>&1 | tail -5` passes; failure: remove the `ban risk` paragraph and assert `grep -q 'ban risk' README.md` fails. Evidence `.omo/evidence/task-15-waha-finalize-15-16.md`.
  Commit: Y | docs(operations): refresh Compose modes and ban-risk guidance

- [x] 4. Make state files current and verify no secret in repo
  What to do / Must NOT do: Update `.claude/state/CURRENT_STATUS.md` and `TASK_QUEUE.md` to mark 15 done, 16 in-progress, and ensure `DECISIONS_LOG.md` reflects the pinned WAHA digest. Run `pnpm secret-scan` and assert no `waha_api_key` value or `ENCRYPTION_MASTER_KEY` plaintext appears in `git ls-files` output, only `*.example` and `.secrets/*` references. Must NOT commit `.secrets/*` or log plaintext.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 5, 6
  References (executor has NO interview context - be exhaustive): `.claude/state/CURRENT_STATUS.md:1`, `.claude/state/TASK_QUEUE.md:1`, `scripts/release-checks.mts:1` (secrets check), `.secrets/postgres_password:1` (gitignored)
  Acceptance criteria (agent-executable): `pnpm secret-scan 2>&1 | tail -5` exits 0 and `git ls-files | xargs grep -l 'waha_api_key' | grep -qv '.example' | wc -l` equals 0
  QA scenarios (name the exact tool + invocation): happy: `pnpm secret-scan`; failure: temporarily write `waha_api_key: fake-secret-123` into `apps/web/src/app.tsx` and assert `pnpm secret-scan` fails, then revert. Evidence `.omo/evidence/task-15-waha-finalize-15-16.md`.
  Commit: N | no commit until explicitly requested

- [x] 5. Run lint/typecheck/test and fix defects in scope
  What to do / Must NOT do: Run `pnpm lint 2>&1 | tail -20`, `pnpm typecheck 2>&1 | tail -20`, `pnpm test 2>&1 | tail -30` (Vitest pool forks). Fix any failures in the changed surfaces (`admin-pages.tsx`, `user-access-page.tsx`, `auth/service.ts`, `dashboard-view-router.tsx`) without expanding scope to media/campaigns/Redis. Must NOT suppress with `as any` / `@ts-ignore`.
  Parallelization: Wave 3 | Blocked by: 3, 4 | Blocks: 6, 7
  References (executor has NO interview context - be exhaustive): `scripts/feature-check.mts:1` (feature gate), `apps/web/src/components/admin-pages.tsx:178` (SettingsPage), `apps/web/src/components/user-access-page.tsx:35` (RowActions), `apps/api/src/auth/service.ts:203` (enableUser)
  Acceptance criteria (agent-executable): `pnpm lint` exits 0 and `pnpm typecheck` exits 0 and `pnpm test 2>&1 | grep -q 'Test Files.*passed'`
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- users-table 2>&1 | tail -10` passes; failure: inject `as any` in `user-access-page.tsx` and assert `pnpm lint` or `typecheck` fails. Evidence `.omo/evidence/task-16-waha-finalize-15-16.md`.
  Commit: N | no commit until explicitly requested

- [x] 6. Verify Settings/Users regression (portaled menus, WAHA creds, full-width)
  What to do / Must NOT do: Run `pnpm feature --test-file tests/users-table.test.ts --test-name "renders the command table" --paths apps/web/src/components/user-access-page.tsx apps/web/src/components/admin-pages.tsx apps/web/src/styles.css` and manual Playwright check via `tests/e2e/users-row-menu.spec.ts` (3/3 menus `fullyInViewport`, `disableDialogOpened`) and Settings WAHA panel (`GET /admin/connections` shows `bundled-waha` with `baseUrl` and masked `••••`). Must NOT break horizontal scroll (`wrap 682 < table 1010`).
  Parallelization: Wave 3 | Blocked by: 5 | Blocks: 7, 8
  References (executor has NO interview context - be exhaustive): `tests/users-table.test.ts:75` (renders command table), `tests/e2e/users-row-menu.spec.ts:1` (portaled menu), `apps/web/src/components/admin-pages.tsx:340` (WAHA panel), `apps/web/src/styles.css:570` (users-table min-width)
  Acceptance criteria (agent-executable): `pnpm feature ...` exits 0 and `node /tmp/opencode/users-ui-check.mjs 2>&1 | grep -q '"items":3'` for 3 rows and `curl -s http://127.0.0.1:38080/assets/*.js | grep -q 'WAHA credentials'`
  QA scenarios (name the exact tool + invocation): happy: `node /tmp/opencode/users-ui-check.mjs` shows `lastRow YES up`; failure: revert `isLast` logic and assert lastRow menu overlaps. Evidence `.omo/evidence/task-16-waha-finalize-15-16.md`.
  Commit: N | no commit until explicitly requested

- [x] 7. Secret-scan and scope-docs checks
  What to do / Must NOT do: Run `pnpm secret-scan 2>&1 | tail -10` and `pnpm verify:scope 2>&1 | tail -10` and `pnpm docs:check 2>&1 | tail -10`. Assert no `*.test.ts` contains `passwordHash` and no scope leak (`personal` vs `business` isolation). Must NOT commit with secret-scan failure.
  Parallelization: Wave 3 | Blocked by: 5 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `scripts/release-checks.mts:1` (scope/secrets), `tests/users-table.test.ts:103` (not.toContain passwordHash), `docs/waha-capability-matrix.md:1`
  Acceptance criteria (agent-executable): All three commands exit 0
  QA scenarios (name the exact tool + invocation): happy: `pnpm docs:check`; failure: add `passwordHash` to `tests/users-table.test.ts` and assert scope check fails. Evidence `.omo/evidence/task-16-waha-finalize-15-16.md`.
  Commit: N | no commit until explicitly requested

- [x] 8. Run e2e (schedule/restart/outage/463/475/purge/backup) against disposable stack
  What to do / Must NOT do: Run `pnpm test:e2e -- --grep "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"` against disposable Postgres + mocked WAHA (use `E2E_DATABASE_URL` disposable as in `tests/e2e/global-setup.ts`). Assert one scheduled send survives restart, visible recovery states, bounded retries, no duplicate dispatch, notification toggles, confirmation-gated purge, and encrypted backup restore from `docs/operations.md` flow. Must NOT use production DB.
  Parallelization: Wave 4 | Blocked by: 6, 7 | Blocks: 9
  References (executor has NO interview context - be exhaustive): `tests/e2e/dashboard.spec.ts:229` (creates, edits, cancels schedule), `tests/e2e/global-setup.ts:34` (disposable Postgres), `playwright.config.ts:4` (webServer)
  Acceptance criteria (agent-executable): `pnpm test:e2e 2>&1 | tail -20` shows `passed` and `docker compose -p relaynest ps` all `healthy` after a restart
  QA scenarios (name the exact tool + invocation): happy: `pnpm test:e2e -- dashboard.spec.ts -g "creates, edits, and cancels a persisted Personal schedule"` passes; failure: inject duplicate dispatch and assert `expect(dispatchRequests).toBe(0)` would fail. Evidence `.omo/evidence/task-16-waha-finalize-15-16.md`.
  Commit: N | no commit until explicitly requested

- [x] 9. Run audit and produce final evidence bundle
  What to do / Must NOT do: Run `pnpm audit --audit-level=high 2>&1 | tail -20` and ensure no high/critical, then collate `.omo/evidence/task-15*.md` + `task-16*.md` + `docker compose -p relaynest -f ... config` outputs into `.omo/evidence/final-*.md` placeholders for F1-F4. Update `.claude/state/CURRENT_STATUS.md` to mark 15-16 done. Must NOT publish audit with high vulns.
  Parallelization: Wave 4 | Blocked by: 8 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `package.json:20` (audit script), `.claude/state/CURRENT_STATUS.md:1`, `.omo/evidence/task-12-waha-command-center.md:1` (prior evidence pattern)
  Acceptance criteria (agent-executable): `pnpm audit --audit-level=high` exits 0 and `ls .omo/evidence/final-*.md 2>&1 | wc -l` equals 4
  QA scenarios (name the exact tool + invocation): happy: `pnpm audit --audit-level=high`; failure: add `lodash@4.17.20` with known vuln and assert audit fails. Evidence `.omo/evidence/task-16-waha-finalize-15-16.md`.
  Commit: Y | chore(release): finalize Compose and verification evidence

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit — run `pnpm verify:requirements --plan .omo/plans/waha-command-center.md`; assert every Must-have has an implementation/test reference, every Must-NOT-have has a negative assertion, and exit non-zero for any unmapped item. Save `.omo/evidence/final-plan-compliance.md`.
- [x] F2. Code quality and security review — run `pnpm lint && pnpm typecheck && pnpm audit --audit-level=high && pnpm secret-scan`; inspect auth/scope, encryption/key handling, error redaction, dependency lockfile, and Docker user/port settings. Any high vulnerability, secret match, type/lint failure, or cross-scope leak fails the gate. Save `.omo/evidence/final-security-quality.md`.
- [x] F3. Real executable QA — run `pnpm test:e2e -- --grep "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"` against disposable Postgres and mocked WAHA; assert one scheduled send, visible recovery states, bounded retries, no duplicate dispatch, notification toggles, confirmation-gated purge, and successful encrypted restore. Save `.omo/evidence/final-e2e.md`.
- [x] F4. Scope fidelity and documentation review — run `pnpm verify:scope && pnpm docs:check`; assert no MVP UI/API path for media, recurring jobs, campaigns, broadcasts, autonomous sending, public registration, or public WAHA API exposure, and confirm README/setup/security/operations plus all `.claude/` state files match actual behavior. Save `.omo/evidence/final-scope-docs.md`.

## Commit strategy
- Docs-only (Todo 3) commits as `docs(operations): refresh Compose modes and ban-risk guidance`
- Final evidence bundle (Todo 9) commits as `chore(release): finalize Compose and verification evidence`
- No auto-commit for verification steps; keep `apps/web` and `apps/api` changes reviewable until F1-F4 approve.

## Success criteria
- Both `docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config` and `... -f docker-compose.bundled-waha.yml --profile waha config` pass, only `web` publishes `${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080}:4173`, secrets are file-based, and `Dockerfile.waha` is digest-pinned.
- `pnpm lint && typecheck && test && test:e2e && audit --audit-level=high` all green, `docker compose ps` all `healthy` after restart, and `.omo/evidence/final-*.md` exists.
- Settings shows 5 full-width panels for admin (including WAHA credentials with masked `••••`) and Users shows reversible Enable with horizontal scroll like Send.
