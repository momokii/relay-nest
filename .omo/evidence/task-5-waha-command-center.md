# Todo 5 evidence: authentication and authorization

## Baseline

- `npx --yes pnpm@10.12.4 lint` — PASS.
- `npx --yes pnpm@10.12.4 typecheck` — PASS.
- `npx --yes pnpm@10.12.4 test` — PASS before edits (5 passing, 6 PostgreSQL tests skipped without `DATABASE_URL`).

## Implementation

- Added first-user-only Admin bootstrap; no public registration after bootstrap.
- Added Node `scrypt` password hashing, malformed-hash rejection, opaque SHA-256 session-token persistence, eight-hour revocable sessions, and disabled-user revocation.
- Added HttpOnly/SameSite cookies, production `Secure` cookies, same-origin checks, header-based double-submit CSRF, safe 400/401/403/429 error bodies, and no credential/message/WAHA-key response fields.
- Added scoped Admin/Operator/Viewer roles and explicit per-session grants. Authorization checks exact Personal/Business scope, active session status, grant, and role before scoped reads/commands.
- Added append-only audit events for bootstrap/login/user/grant/disable, failed-login, rate-limit rejection, logout, and session-revocation changes.
- Added PostgreSQL-backed IP rate limiting with advisory-lock concurrency, lock-protected clear, integer counters, 15-minute windows/blocks, expired-row cleanup, and a 10,000-row retention cap; added `0001_futuristic_scream.sql`, `0002_shiny_mauler.sql`, and Drizzle metadata.
- Added transaction/advisory-lock Admin bootstrap, scope-filtered `rolesByScope`, malformed-login failure auditing/rate limiting, and a bundled CJS production API artifact.
- Added one validated database configuration resolver used by the API runtime and `apps/api/drizzle.config.ts`; it accepts a PostgreSQL `DATABASE_URL` or complete Compose variables with `DATABASE_PASSWORD_FILE`.
- Compose now mounts the ignored, host-provided `postgres_password` file into both PostgreSQL and API; `.env.example` documents the non-secret path contract.

## Test evidence

- Red phase: `npx --yes pnpm@10.12.4 exec vitest run tests/authz.test.ts` — expected missing-module failure before implementation.
- Initial migration attempt — FAIL as expected during verification because PostgreSQL required an explicit text-to-integer cast; fixed with `USING "failures"::integer` in `0002_shiny_mauler.sql`.
- Fresh disposable database: `DATABASE_URL=postgresql://<redacted> npx --yes pnpm@10.12.4 db:migrate` — PASS after the cast fix.
- `TASK5_AUTH_DATABASE_URL=postgresql://<redacted> npx --yes pnpm@10.12.4 exec vitest run tests/auth-http.integration.test.ts tests/auth-migration.integration.test.ts --reporter=dot` — PASS, 4/4 after final fixes; concurrent bootstrap, limiter instances, audit rows, scope-filtered roles, and migration schema assertions included.
- `DATABASE_URL=postgresql://<redacted> TASK5_AUTH_DATABASE_URL=postgresql://<redacted> npx --yes pnpm@10.12.4 test` — PASS, 33/33 with the full PostgreSQL-backed auth suite enabled; run serially to avoid the truncating fixture racing repository tests.
- `npx --yes pnpm@10.12.4 lint` — PASS, 66 files.
- `npx --yes pnpm@10.12.4 typecheck` — PASS.
- `npx --yes pnpm@10.12.4 build` — PASS, all five workspace build projects; API uses pinned esbuild CJS bundle `dist/index.cjs`.
- `npx --yes pnpm@10.12.4 audit --audit-level high` — PASS, no known vulnerabilities.
- `npx --yes pnpm@10.12.4 exec vitest run tests/config.test.ts tests/workspace-smoke.test.ts --reporter=dot` — PASS, 4/4; Compose host/port/name/user resolution, Docker secret-file resolution, invalid/missing rejection, and workspace configuration.
- `docker compose config --quiet` — PASS; rendered API configuration contains `postgres`, port `5432`, database `waha_command_center`, user `app`, and `/run/secrets/postgres_password` with no committed password.
- `POSTGRES_PASSWORD_FILE=./.tmp/compose-secrets/postgres_password API_PORT=3118 docker compose up -d postgres api` — PASS after retrying readiness; PostgreSQL healthy, API healthy, and `GET http://127.0.0.1:3118/health` returned `{"status":"ok"}`.
- Production startup: `DATABASE_URL=postgresql://<redacted> APP_ENV=development NODE_ENV=development PORT=3117 node dist/index.cjs` — PASS; exact `GET /health` returned `{"status":"ok"}` with HTTP 200.

## Manual QA

API started with the repository command using `DATABASE_URL` and `PORT=3115`; it was stopped after QA.

- `POST /auth/bootstrap` — 201; response contained only redacted user metadata; cookies were `HttpOnly`/`SameSite=Strict`.
- `POST /auth/login` — 200; response contained no password or key.
- `GET /auth/me` without cookie — 401 `{"error":"unauthenticated"}`.
- Malformed `POST /auth/login` — 400 `{"error":"invalid request"}`.
- `POST /auth/logout` without `X-CSRF-Token` — 403; with the issued token — 204.
- `GET /auth/me` after logout — 401.
- Two concurrent bootstrap requests — 201 and 409; exactly one initial Admin was created.
- Admin user creation — 201; Operator and Viewer response bodies contained only id/email/displayName.
- Operator scoped command with Personal grant — 200.
- Viewer scoped mutation with valid CSRF — 403.
- Viewer Business read from a Personal-only grant — 403.
- Six bad logins from one IP — final response 429 with `Retry-After`; response did not contain the email.
- PostgreSQL audit probe — audit rows included `auth.login_failed`, `auth.login_rate_limited`, `auth.logout`, and `auth.sessions_revoked`; subjects were constant and no secrets or message content were recorded.
- Malformed login — 400 and a generic `auth.login_failed` audit row; repeated malformed attempts use the same IP limiter path.
- User disable authorization requires Admin authority in every account scope assigned to the target user; a Personal-only Admin cannot globally disable a user with Business access.
- Fastify request logs showed method/path/status/IP only; no request bodies, passwords, message content, or WAHA keys.

## Adversarial checks

- `malformed_input`: Zod rejects malformed credentials, UUIDs, roles, scopes, and query values with safe bodies.
- `prompt_injection`: no prompt/message field is interpreted or logged by this auth surface; scoped command response is metadata only.
- `stale_state`: every request re-reads active user, revocation, session status, exact scope, and grant from PostgreSQL.
- `dirty_worktree`: no `.omo` plan state or ledger was edited; no commit was created.
- `generated_artifact`: temporary cookies/logs and disposable PostgreSQL database were removed; API listener stopped.
- `long_command`: migration, test, build, and audit commands completed within bounded tool timeouts.
- `misleading_success_output`: assertions used status codes, redacted bodies, cookie attributes, PostgreSQL audit count, and post-revocation denial.
- `repeated_interruption`: transactional Admin user creation prevents a user without its requested roles; disable revokes all active auth sessions.
- `cancel_resume`: revocation is an idempotent database update and re-authentication rechecks revocation state.
- `flaky_test`: the initial shared-DB full-suite race was reproduced, then ruled out by an isolated `TASK5_AUTH_DATABASE_URL` integration fixture and repeated focused passes.
- `shared_limiter`: eight concurrent failures through independent limiter instances produced one PostgreSQL counter at five and blocked decisions; no process-local limiter remains in production.
- `ip_retention`: only the client-IP key and integer/window state are retained in `auth_rate_limits`; expired rows are deleted on subsequent limiter operations, with no credentials/tokens/content stored.
- `scope_disable`: disabling a user is denied unless the actor can manage every scope represented by the target user's role grants.
- `database_config`: API and Drizzle resolve the same PostgreSQL URL contract; missing, mixed, unsupported, incomplete, and unreadable password configuration fails with a generic typed configuration error.

## Risks and blockers

- No LSP diagnostics command is exposed in this environment; strict typecheck, Biome, focused tests, full tests, build, live PostgreSQL tests, and package audit were run instead.
- Compose secret note: deployment must provide `POSTGRES_PASSWORD_FILE` as a host secret file (or equivalent secret-mounted path); the repository contains only the ignored path contract, never the secret value.

No password, API key, message content, contact content, or session token is recorded in this evidence file.
