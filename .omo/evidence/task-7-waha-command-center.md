# Todo 7 evidence: WAHA session lifecycle and linking parity

Date: 2026-08-16

## Scope implemented

- Server-only WAHA adapter methods use the pinned 2026.8.1 paths for session list/detail/create/update/delete, start/stop/restart/logout, QR raw retrieval, pairing code, passkey challenge/assertion/confirmation, `/me`, timelock, and capping.
- Scoped service and route surfaces enforce Personal/Business scope, per-session grants, Admin/Operator/Viewer behavior, CSRF on mutations, and Admin confirmation for logout/delete.
- Browser-facing projections omit connection IDs, API keys, raw WAHA payloads, and unknown metadata. `WORKING` remains distinct from service health and sending readiness.
- Status history is exposed as a read-only scoped surface through `GET /scoped/sessions/:sessionId/status-history`.

## Automated contract evidence

Commands run:

```text
npx --yes pnpm@10.12.4 exec vitest run tests/waha-adapter.test.ts tests/waha-session-adapter.test.ts tests/waha-session-http.test.ts
13 tests passed; repeated twice with the same result
DATABASE_URL='postgres://app:<redacted>@127.0.0.1:55432/waha_command_center' npx --yes pnpm@10.12.4 test
51 tests passed; 3 expected skips; repeated twice with the same result
npx --yes pnpm@10.12.4 lint
Biome checked 79 files with no findings
npx --yes pnpm@10.12.4 typecheck
passed
npx --yes pnpm@10.12.4 build
workspace build passed
npx --yes pnpm@10.12.4 audit --audit-level high
No known vulnerabilities found
```

The local mock fetch contract captured these exact upstream requests with the server-only `X-Api-Key` header:

```text
GET /api/sessions/personal
POST /api/sessions/personal/start
POST /api/sessions/personal/stop
POST /api/sessions/personal/restart
POST /api/sessions/personal/logout
DELETE /api/sessions/personal
GET /api/personal/auth/qr?format=raw
POST /api/personal/auth/request-code
GET /api/personal/auth/passkey/challenge
POST /api/personal/auth/passkey
GET /api/personal/auth/passkey/confirmation
POST /api/personal/auth/passkey/confirm
GET /api/sessions/personal/me
GET /api/sessions/personal/timelock
GET /api/sessions/personal/capping
```

The test also asserts no credential appears in returned JSON and that unknown upstream metadata is stripped.

## Manual curl contract

The disposable API deployment requires an authenticated session cookie and CSRF cookie. The exact requests for manual QA are:

```text
curl -i -H 'Cookie: waha_session=<redacted>' 'http://127.0.0.1:3301/scoped/sessions?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>' 'http://127.0.0.1:3301/scoped/sessions/<uuid>?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/qr?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/timelock?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -H 'Content-Type: application/json' -d '{"action":"start","confirmed":false}' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/lifecycle?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -H 'Content-Type: application/json' -d '{"action":"stop","confirmed":false}' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/lifecycle?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -H 'Content-Type: application/json' -d '{"action":"restart","confirmed":false}' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/lifecycle?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -H 'Content-Type: application/json' -d '{"action":"logout","confirmed":true}' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/lifecycle?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/capping?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -H 'Content-Type: application/json' -d '{"phoneNumber":"+628123456789"}' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/pairing-code?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -H 'Content-Type: application/json' -d '{"response":"opaque"}' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/auth/passkey?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -X POST 'http://127.0.0.1:3301/scoped/sessions/<uuid>/auth/passkey/confirm?scope=personal'
curl -i -H 'Cookie: waha_session=<redacted>; waha_csrf=<redacted>' -H 'X-CSRF-Token: <redacted>' -H 'Content-Type: application/json' -d '{"action":"delete","confirmed":true}' 'http://127.0.0.1:3301/scoped/sessions/<uuid>/lifecycle?scope=personal'
```

Live disposable verification returned `200` for health, session list/detail, QR, status history, timelock, capping, lifecycle start/stop/restart/logout, pairing code, passkey challenge/assertion/confirmation, passkey confirmation, and confirmed delete. The upstream mock returned `204` with an empty body for delete, pairing, passkey assertion, and passkey confirmation; pairing/passkey product routes returned `{ "accepted": true }`, while the delete lifecycle route returned JSON `null` after removing the local grant and session record. When the upstream list call was unavailable, `GET /scoped/sessions` returned the redacted `502 {"error":"WAHA unavailable"}` contract rather than an unhandled `500`.

Expected safe outcomes are scoped JSON projections, `403` for revoked/cross-scope/viewer mutation requests, `409 {"error":"confirmation_required"}` for unconfirmed destructive actions, and `501 {"error":"unsupported_capability"}` for an unavailable engine capability. Upstream 463 and 475 remain visible as timelock/capping classifications; the service never restarts automatically.

## Baseline and limitations

- Baseline lint and typecheck passed before Todo 7 edits.
- The first full test attempt without an explicit disposable `DATABASE_URL` used the host user's default database credentials and failed 7 PostgreSQL integration assertions; rerunning with the disposable database passed all 46 runnable tests twice.
- No real WAHA image was started; the repository matrix records that runtime verification is not claimed. The contract tests use a disposable local HTTP mock and redact all credentials.

## Todo 7 deletion blocker regression and verification

### Root cause and fix

- `sessions.remove()` previously deleted `session_grants` and then attempted the parent delete as separate database statements. `normalized_events`, `contacts`, `scheduled_jobs`, and `dispatch_attempts` also referenced the session with `ON DELETE NO ACTION`, so a parent-delete failure left grants removed.
- `audit_entries` is immutable and must remain as content-free accountability. Its nullable `session_id` now uses `ON DELETE SET NULL`; the immutable trigger permits only that automatic reference detachment when every audit content field is unchanged.
- `sessions.remove()` now deletes dispatch attempts, scheduled jobs, contacts, normalized events, grants, and the session inside one PostgreSQL transaction. Any failure rolls back all dependent-row changes.

### Red-to-green evidence

The new PostgreSQL regression tests initially failed before the fix:

```text
tests/repositories.integration.test.ts: 5 passed, 2 failed
delete with normalized_events: violates foreign key constraint audit_entries_session_id_sessions_id_fk
rollback test: grant deletion occurred before the parent delete failure
```

After the fix:

```text
npx --yes pnpm@10.12.4 exec vitest run tests/repositories.integration.test.ts --reporter=dot
7 tests passed
```

### Exact verification commands and results

```text
DATABASE_URL='postgres://app:<redacted>@127.0.0.1:55432/waha_command_center' npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
PASS: migrations applied successfully on fresh PostgreSQL 17.6.

npx --yes pnpm@10.12.4 exec vitest run tests/waha-session.test.ts tests/waha-session-http.test.ts tests/waha-session-adapter.test.ts --reporter=dot
PASS: 3 files, 6 tests; run twice with the same result.

DATABASE_URL='postgres://app:<redacted>@127.0.0.1:55432/waha_command_center' npx --yes pnpm@10.12.4 exec vitest run tests/repositories.integration.test.ts --reporter=dot
PASS: 1 file, 7 tests; run twice with the same result.

DATABASE_URL='postgres://app:<redacted>@127.0.0.1:55432/waha_command_center' npx --yes pnpm@10.12.4 test
PASS: 15 files, 56 tests; 3 expected skips; isolated PostgreSQL full suite run twice.

npx --yes pnpm@10.12.4 lint
PASS: Biome checked 79 files with no findings.

npx --yes pnpm@10.12.4 typecheck
PASS: tsc project build completed with no errors.

npx --yes pnpm@10.12.4 build
PASS: all workspace packages, API bundle, and web bundle built successfully.

npx --yes pnpm@10.12.4 audit --audit-level high
PASS: No known vulnerabilities found.

DATABASE_URL='postgres://app:<redacted>@127.0.0.1:55432/waha_command_center' npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
PASS: repeat migration is idempotent.

docker compose config
WAHA_BASE_URL='http://waha.example.invalid' docker compose -f docker-compose.yml -f docker-compose.external-waha.yml config
PASS: default, external-WAHA, and bundled-WAHA Compose configurations validated.
```

### Live disposable curl verification

```text
Scenario: local API + disposable WAHA HTTP mock + isolated PostgreSQL; seeded one Personal session, one Admin grant, one normalized event, and one immutable audit row.
Request: POST /scoped/sessions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/lifecycle?scope=personal
Body: {"action":"delete","confirmed":true}
Result: HTTP 200; body null
Post-delete SQL counts (session, grants, normalized_events, audit, audit_detached): 0,0,0,1,1
```

The initial literal-loopback probe correctly returned `502 {"error":"WAHA unavailable"}` because the URL policy rejects private/loopback WAHA hosts; the final probe used `127.0.0.1.nip.io` for the disposable mock and completed successfully without changing that security policy. No real WAHA image was required for this repository deletion verification.
