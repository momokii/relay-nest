# Historical Compose External Proxy QA — 2026-08-18

> Historical pre-hardening receipt. Do not reuse its API-port or environment
> variables as current deployment guidance; current Compose keeps API private
> and uses file-backed secrets.

## Scope

This receipt covers the Compose-only same-origin browser/API routing fix. It does
not claim WAHA linking, message delivery, or production credentials.

## Runtime root cause

- Host API `GET http://127.0.0.1:33001/health` returned `200` with
  `{"status":"ok"}`.
- Host API `GET http://127.0.0.1:33001/auth/me` returned `401` with
  `{"error":"unauthenticated"}`.
- Before the fix, real browser `GET http://127.0.0.1:38081/auth/me` returned
  `404` with an empty response.
- The web client intentionally uses relative `/auth/me`; `vite.config.ts` defines
  the proxy only when `VITE_API_PROXY_TARGET` is present.
- The first target-only rebuild still returned browser `404`. The web container
  had the target, but its runtime filesystem lacked `vite.config.ts`; a direct
  container request to `http://api:3000/auth/me` returned `401`.

The confirmed mechanism was therefore missing runtime-image configuration, with
the Compose target also previously absent.

## Changes

- `docker-compose.yml`: web receives `VITE_API_PROXY_TARGET: http://api:3000`.
- `Dockerfile.web`: runtime image copies `vite.config.ts` so Vite preview loads
  its same-origin proxy configuration.
- `tests/compose-external-proxy.test.ts`: regression proof checks both the Compose
  target and runtime config copy, and rejects host API/WAHA credential exposure.

## Failing-first proof

1. Before the Compose edit, focused Vitest failed because the web service lacked
   `VITE_API_PROXY_TARGET`.
2. After adding only the target, browser QA remained `404`; the strengthened test
   then failed because the runtime Dockerfile lacked `vite.config.ts`.
3. After the runtime copy, focused Vitest passed `1/1` and the browser toggle
   changed the exact repro from `404` to `401`.

## Exact retained-stack QA

```text
API_PORT=33001 WEB_PORT=38081 WAHA_BASE_URL=http://127.0.0.1:9 WAHA_API_KEY=<redacted-placeholder> \
docker compose -p relaynest-compose-external-qa \
  -f docker-compose.yml -f docker-compose.external-waha.yml up -d --build
```

The project remained running with API `33001`, web `38081`, and PostgreSQL
healthy. The bundled WAHA image was not included or changed.

Real Playwright Chromium proof against `http://127.0.0.1:38081/`:

```text
GET http://127.0.0.1:38081/auth/me
status: 401
content-type: application/json; charset=utf-8
body: {"error":"unauthenticated"}
```

API health remained:

```text
HTTP/1.1 200 OK
{"status":"ok"}
```

## Verification

- Focused seam test: `1 passed`.
- Typecheck: passed.
- Changed-file Biome: passed.
- Full Playwright/Admin E2E: `12 passed`.
- Full Vitest: `149 passed`, `38 skipped`, `12 failed` from the pre-existing
  workstation PostgreSQL `28P01` password boundary; no task code implicated.
- Full Biome: pre-existing analytics fixture diagnostics plus disposable E2E JSON
  artifacts; artifacts were removed during closeout.
- `git diff --check`: passed.

## Retention and cleanup

- Retained project: `relaynest-compose-external-qa` remains running.
- Existing WAHA/dev services were not connected to or stopped.
- Disposable Playwright/runtime artifacts from this run were removed.
- Secrets and placeholder values were not printed or stored in this receipt.
