# F2 Security and Quality Audit — waha-finalize-15-16

Date: 2026-09-11
Plan: `.omo/plans/waha-finalize-15-16.md`, final verification wave item F2
(line 137). Replaces the Todo-9 placeholder in this file (the superseded
2026-08-28 BLOCKED verdict remains in git history, `1d648bd` and ancestors).

## Verdict

**PASS.** All four automated gates exit 0 with 0 high/critical vulnerabilities
and 0 secret matches. Manual inspection of auth/scope, encryption/key
handling, error redaction, dependency lockfile, and Docker user/port found no
cross-scope leak, secret exposure, or boundary violation. One stale-state
discrepancy in `.claude/state/TASK_QUEUE.md` is recorded below (documentation
drift, not a code defect).

## Automated gates (executed 2026-09-11, this session)

Toolchain: Node v22.23.1, `npx --yes pnpm@10.12.4` (per README; `pnpm` is not
on PATH).

| Gate | Command | Exit | Output tail |
| --- | --- | --- | --- |
| Lint | `npx --yes pnpm@10.12.4 lint` | 0 | `Checked 324 files in 405ms. No fixes applied.` |
| Typecheck | `npx --yes pnpm@10.12.4 typecheck` | 0 | `tsc -b --pretty false` clean |
| Audit | `npx --yes pnpm@10.12.4 audit --audit-level=high` | 0 | `4 vulnerabilities found / Severity: 4 moderate` |
| Secret scan | `npx --yes pnpm@10.12.4 secret-scan` | 0 | silent pass (`release-checks.mts secrets`) |

Audit detail (re-run at `--audit-level=moderate` for the record): the 4
moderate advisories are `fastify` (x2, `apps__api>fastify`), `vitest` (`.`,
root devDependency), and `@vitest/mocker` (`.>vitest>@vitest/mocker`). 0 high,
0 critical. The gate's failure mode is proven non-vacuous: Todo 9 recorded an
initial exit 1 with 8 high `fast-uri` findings before the lockfile bump to
patched `fast-uri@3.1.7`/`4.1.4`.

## Manual inspection findings

### Auth and scope enforcement (server-side, deny-by-default)

- `apps/api/src/auth/authorization.ts:28` — `authorizeSessionAction` is a pure
  deny-by-default decision: `null` principal → denied; `accountScope !==
  sessionScope` → `scope_denied`; inactive session → `session_disabled`;
  missing per-user grant row → `grant_denied`; `command` actions additionally
  require `admin`/`operator` in the acting scope's roles. Explicit reason
  codes, no default-allow path.
- `apps/api/src/auth/service.ts` — session tokens stored only as hashes
  (`hashToken`); `authenticate` checks revocation, `expiresAt`, and
  `users.active`; CSRF verification compares hashed tokens with
  `timingSafeEqual`; login is Postgres-rate-limited (`postgres-rate-limit.ts`)
  with `auth.login_rate_limited` audit events; bootstrap is allowed only while
  the users table is empty, under `pg_advisory_xact_lock` (single-tenant,
  Admin-created users only; no public registration path).
- `apps/api/src/auth/service.ts:203`/`admin.ts:145` — `disableUser` and
  `resetPassword` revoke all of the target's live sessions;
  `AdminService.canManage` checks the per-scope `admin` role;
  `canDisable` requires admin coverage of every scope the target holds.
- `apps/api/src/auth/password.ts` — scrypt (64-byte key, 16-byte random salt,
  prefixed format, `timingSafeEqual` verify).
- Cookies (`apps/api/src/auth/http.ts:252-255`): session cookie
  `HttpOnly; SameSite=Strict; Max-Age=28800` plus `Secure` when
  `APP_ENV=production`; CSRF cookie is deliberately readable (client must echo
  it in `x-csrf-token`), also `SameSite=Strict` + prod `Secure`.
- CORS is `origin: false` (`app.ts:197`) and mutating session routes gate on
  `sameOrigin` + CSRF (`session-http-support.ts:92-94,130-137`).
- Route-level auth: `waha/connection-http.ts:26-34` requires any-scope admin
  before returning connection metadata (id/name/baseUrl only — no key
  material); all other HTTP surfaces go through `authenticate()` +
  `authorize()`/`SessionRouteAuth`.

### Encryption and key handling

- `packages/config/src/encryption.ts` — AES-256-GCM envelopes: 12-byte random
  nonce, 32-byte key, AAD binds the `accountScope` metadata (`personal` vs
  `business`), so a ciphertext moved across scopes or tampered fails
  authentication; envelope schema pins `version: 1` and the algorithm string
  and validates nonce (12 B) / authTag (16 B) lengths on decrypt.
- Key sourcing (`packages/config/src/index.ts:88-107`): exactly one of
  `ENCRYPTION_MASTER_KEY` or `ENCRYPTION_MASTER_KEY_FILE` (mutual-exclusion
  enforced by the Zod schema), 32-byte base64 enforced, file-read failure
  raises an opaque `EnvironmentConfigError` (no path/contents leak). Compose
  mounts keys as Docker secrets via `file: ${ENCRYPTION_MASTER_KEY_FILE:?}`
  and `${WAHA_API_KEY_FILE:?}` (`docker-compose.yml:92-98`,
  `docker-compose.bundled-waha.yml:29-33`).
- WAHA API keys and SMTP/Telegram credentials are stored only as encrypted
  envelopes (`app-session-service.ts:47-56`,
  `notifications/settings.ts:125`); decryption happens server-side immediately
  before the outbound `X-Api-Key` header (`waha/adapter.ts:165`).
- `createBlindIndex` is HMAC-SHA256 over the master key for contact lookup.
- Webhook payloads are stored encrypted with the same scope-bound envelope;
  the redaction fallback stores only an HMAC digest plus sentinel
  nonce/authTag (`waha/webhook.ts:163-166`) — content-free by construction.

### Error redaction

- Global handler (`app.ts:198-217`): every unmapped error becomes
  `500 {"error":"internal error"}`; Zod → `400 invalid request`; backup →
  `400 invalid backup`; purge/retention → fixed `409` codes. No stack traces,
  SQL, or internals reach clients.
- WAHA transport errors: `rejectionDetail` (`waha/adapter.ts:92-117`) returns
  only two fixed, human-written strings (QR-scan state, duplicate session
  name) or `undefined`; provider response bodies, keys, and URLs are never
  echoed. `sendService` maps `WahaHttpError` to `502 WAHA unavailable` with at
  most that curated `detail` (`session-http-support.ts:56-63`). Statuses are
  classified to coarse codes (463→timelock, 475→capping,
  `scheduler/waha.ts:4-19`).
- Provider-facing responses are fixed JSON shapes (`webhook-http.ts:123-128`).
- Notification settings return masked secrets (`••••••••` + last 4,
  `notifications/settings.ts:194-196`); submitting a masked value keeps the
  stored secret (`resolveMasked`). WAHA environment introspection passes
  through `sanitizeWahaEnvironment` before display.
- Outbound SSRF posture: `waha/url-policy.ts:53-89` rejects non-HTTP(S)
  schemes, embedded credentials/query/fragment, and private/loopback targets
  (IPv4 ranges incl. CGNAT and benchmarking, `::1`, ULA, link-local, and
  IPv4-mapped IPv6) unless the host is the bundled `waha`/`waha.internal` or
  loopback was explicitly allowed (test-only per `app.ts:66-79`).
- Fastify runs with `logger: true` (`app.ts:93`); default serializers log
  method/url/remote address only — no request bodies or headers, so passwords
  and cookies do not enter logs through the default path.

### Dependency lockfile

- `pnpm-lock.yaml` present, `lockfileVersion: '9.0'`;
  `npx --yes pnpm@10.12.4 install --frozen-lockfile --ignore-scripts` exits 0
  (lockfile consistent with all workspace manifests; no drift).
- Root override pins `esbuild@0.25.12` (`package.json` `pnpm.overrides`).
- `pnpm audit --audit-level=high` exit 0 (4 moderate, 0 high/critical).

### Docker user and port posture

- `Dockerfile.api` / `Dockerfile.web`: digest-pinned
  `node:22.23.1-alpine@sha256:16e22a55…` build + runtime stages, both end with
  `USER node` (api exposes 3000, web exposes 4173 — container-internal only).
- `Dockerfile.waha`: `FROM devlikeapro/waha:latest-2026.8.1@sha256:d52ad4f3…`
  (digest-pinned, no unpinned `latest`).
- `docker-compose.yml:65-66` — the only host publication is
  `"${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080}:4173"` (loopback
  default). Neither `api` (3000) nor bundled `waha` (3000) is published; both
  stay on the internal Compose network. No `network_mode: host`, no privileged
  flags in the compose files.
- Secrets ride `/run/secrets/*` Docker-secret files; resolved Compose config
  receipts from Todo 9 show zero plaintext key values in
  `docker compose config` output for both modes.

## Adversarial: stale-state check

- `.claude/state/TASK_QUEUE.md:62` still reads `F2 security and quality |
  BLOCKED | Todo 11`. That row reflects the **2026-08-28 waha-command-center**
  F-gate closeout (also echoed in the historical `CURRENT_STATUS.md`
  "Session closeout … 2026-08-28" section), whose cited blockers — six
  full-lint diagnostics, unavailable pinned WAHA image — are resolved in the
  finalize-plan record (lint now exits 0 over 324 files; WAHA image is
  digest-pinned per Todo 1). This file is the current finalize-plan F2 verdict
  and supersedes that BLOCKED wording; the orchestrator should update the
  `TASK_QUEUE.md` F2 row when consolidating F1-F4.
- `CURRENT_STATUS.md`'s current top section ("final evidence bundle …
  placeholders (gates PENDING)") is accurate as of the placeholder state but
  is superseded by this executed F2 result for the security/quality axis.

## Residual observations (non-blocking)

- scrypt uses Node's default cost parameters (N=16384, r=8, p=1); adequate
  for the threat model, upgradeable later without format breakage because of
  the `scrypt` prefix scheme.
- Fastify's logger has no explicit `redact` config; safe today because default
  serializers exclude bodies/headers, but any future custom serializer must
  keep secrets out.
- The 4 moderate advisories (`fastify`, `vitest`, `@vitest/mocker`) are below
  the gate threshold; no action required for this release.
