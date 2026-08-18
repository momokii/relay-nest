# Todo 14 Wave 2 Task 2 — Authenticated Admin and Session Evidence

Date: 2026-08-17
Scope: authenticated Admin and session-linking/lifecycle lane only

## Result

**PASS for the requested backend lane.** Existing routes and services were
already present and no missing production behavior was proven. This task added
authenticated PostgreSQL integration coverage only; it did not invent routes,
change production behavior, or claim a real WAHA link.

## Exact changed files

- `tests/task-14-auth-session-fixtures.ts` — disposable PostgreSQL repository
  wiring and deterministic mock WAHA adapter through the existing service seam.
- `tests/task-14-auth-session.integration.test.ts` — authenticated route
  characterization and regression coverage.
- `.omo/evidence/task-14-auth-session.md` — this redacted verification record.

No API, web UI, scheduler, notification, AI, Compose, protected plan, ledger,
or state file was changed by this task.

## Coverage

The two authenticated tests verify:

- `POST /auth/bootstrap` creates Admin roles in both Personal and Business
  scopes; `GET /auth/me` returns the authenticated principal.
- `POST /auth/login` issues protected cookies and does not return the password.
- Admin user creation, explicit session grant, disable, active-session
  revocation, and missing-CSRF denial.
- Session create/list/get through `POST/GET /scoped/sessions`, with explicit
  Admin self-grant because roles do not imply session access.
- Personal/Business scope denial and explicit grant enforcement.
- Lifecycle confirmation for destructive delete and successful start.
- Status-history ordering, QR response, and pairing-code acceptance.
- Deterministic provider-unavailable mapping to `502` without opaque provider
  values in the response.
- Session-link responses exclude connection URLs, stored credential fields, and
  provider configuration values.

## Adversarial classes

- Unauthenticated access and CSRF are covered by the existing auth/session
  integration suites; this lane adds missing-CSRF coverage with a valid body.
- Cross-scope access is denied without exposing the session as authorized.
- A role without an explicit session grant cannot access the session; the Admin
  path also requires an explicit grant.
- Disable revokes the target user's active cookie session.
- Destructive lifecycle action without confirmation returns the documented
  conflict result and does not call the provider.
- Provider unavailability remains visible as unavailable (`502`), never as a
  successful or real WAHA link.
- Passwords, connection URLs, opaque credential columns, and provider payloads
  are not asserted into or returned by the HTTP response.

## Verification transcript (redacted)

Disposable PostgreSQL 17.6 containers were started on isolated local ports,
migrated with the repository migration command, and injected through
`TASK14_AUTH_SESSION_DATABASE_URL`. Credentials, generated IDs, and payload
values are omitted.

```text
npx --yes pnpm@10.12.4 exec biome check \
  tests/task-14-auth-session-fixtures.ts \
  tests/task-14-auth-session.integration.test.ts
PASS — 2 files checked; no fixes applied

npx --yes pnpm@10.12.4 --filter @waha-command-center/api build
PASS — TypeScript compile and esbuild bundle completed

TASK14_AUTH_SESSION_DATABASE_URL=<REDACTED> \
  npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-auth-session.integration.test.ts
PASS — 1 file, 2 tests

TASK5_AUTH_DATABASE_URL=<REDACTED> \
TASK14_AUTH_SESSION_DATABASE_URL=<REDACTED> \
  npx --yes pnpm@10.12.4 exec vitest run \
  tests/auth-http.integration.test.ts \
  tests/waha-session.test.ts \
  tests/waha-session-http.test.ts \
  tests/waha-session-adapter.test.ts \
  tests/task-14-auth-session.integration.test.ts
PASS — 5 files, 11 tests
```

Pure LOC after formatting: fixture `104`; integration test `211`.

Workspace-wide checks were not claimed as passing:

- `npx --yes pnpm@10.12.4 typecheck` is blocked by the pre-existing
  `apps/api/src/ai/service.ts` type error involving the `viewer` role.
- `npx --yes pnpm@10.12.4 lint` is blocked by pre-existing formatting findings
  in `apps/api/src/scheduled-http.ts` and Todo 13's
  `tests/task-13-analytics-db-fixture.ts`.

## Manual QA

Manual backend QA was performed through Fastify `inject` against migrated
disposable PostgreSQL, covering the route outcomes listed above. No browser UI
or real WAHA service was used for this backend lane. The only provider is the
deterministic existing `WahaSessionClient` seam; the unavailable fixture throws
`WahaConnectionUnavailableError`, and the test records that state as `502`
rather than claiming a linked or working WhatsApp account.

## Cleanup receipt

- Disposable containers used for migration/test runs were removed with
  `docker rm -f` in shell `EXIT` traps.
- No Compose service was started or modified.
- No real credentials, WAHA keys, passwords, message content, or provider
  payloads were written to evidence.
- No task-owned server, browser, port, or temporary project artifact remains.

## Risks and residual blockers

- Real WAHA QR/pairing behavior remains unverified because no real provider was
  available; this evidence intentionally makes no real-link claim.
- The existing application path that decrypts server-side WAHA credentials was
  not changed; production credential-decryption behavior remains covered by its
  existing tests.
- Workspace-wide typecheck/lint remain blocked by unrelated pre-existing files
  listed above. API package build and all focused auth/session tests pass.
