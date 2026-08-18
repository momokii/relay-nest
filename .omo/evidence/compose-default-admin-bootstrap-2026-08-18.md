# Default Compose Admin bootstrap — 2026-08-18

## Scope and safety

- Target: default Compose project only (`relaynest-dev-*`), API `33000`, web `38080`.
- Isolated QA/WAHA/Grafana/monitoring services were not targeted.
- No `docker compose down -v`, volume deletion, database reset, auth bypass, CSRF bypass, commit, push, or protected plan/ledger edit was performed.
- The retained Postgres volume was preserved. No real WAHA credentials were used or exposed.

## Hypotheses and runtime evidence

1. **Auth/database state:** refuted as a completed-bootstrap case. Before the fix,
   `information_schema.tables` contained no application relations, and querying
   `users` returned `relation "users" does not exist`; there was no Admin to preserve.
2. **Same-origin/proxy routing:** refuted. A real browser POST reached
   `/auth/bootstrap` through `http://127.0.0.1:38080` with the matching Origin;
   API logs recorded the expected route and HTTP 500, not a routing rejection.
3. **Compose environment/config:** confirmed. The API image had no migration
   directory and startup did not run migrations.

## Original reproduction

Browser: Playwright Chromium against `http://127.0.0.1:38080`.

- UI result: `The server could not complete this request.`
- Exact `/auth/bootstrap` response: `500`
- Exact response body: `{"error":"internal error"}`
- Redacted API log: `/auth/bootstrap` completed with `statusCode:500`.
- Redacted Postgres log: `ERROR: relation "users" does not exist`; statement
  `select "id" from "users"`.

Supporting checks before the fix:

```text
GET http://127.0.0.1:33000/health -> 200 {"status":"ok"}
GET http://127.0.0.1:38080/ -> 200
postgres healthy; api healthy; web running
```

## Fix and red-green proof

Changed only the startup deployment path and its regression proof:

- `Dockerfile.api`: copies existing `apps/api/drizzle` into `/app/drizzle` and
  sets `MIGRATIONS_FOLDER=/app/drizzle`.
- `apps/api/src/index.ts`: runs Drizzle `migrate(...)` before `app.listen(...)`.
- `tests/compose-startup.test.ts`: asserts the image ships migrations and startup
  invokes them.

Red phase:

```text
tests/compose-startup.test.ts failed: expected Dockerfile.api to contain
COPY --from=build --chown=node:node /workspace/apps/api/drizzle ./drizzle
```

Green phase:

```text
tests/compose-startup.test.ts: 1 passed
```

## Rebuild and database preservation

Command:

```text
docker compose up --build -d
```

Result: exit 0; API/web rebuilt; Postgres remained running and healthy. The
application tables were created by startup migrations. Before bootstrap:

```text
users=0
admin_roles=0
```

## Post-fix browser verification

Playwright Chromium submitted the Admin form using a generated non-secret test
identity. API logs recorded `/auth/bootstrap` with `statusCode:201`; database
state became:

```text
users=1
admin_roles=2
```

A fresh real-browser login then returned `login_status=200` and rendered the
authenticated scoped dashboard for the generated Admin identity.

The one-time bootstrap guard was also checked without mutation:

```text
POST /auth/bootstrap -> 409 Conflict
body={"error":"authentication unavailable"}
users=1
admin_roles=2
```

No second Admin was created. The API’s existing conflict behavior is preserved.

## Verification

- Focused regression: passed, `1 test`.
- Changed-file Biome: passed.
- Workspace typecheck: passed.
- Workspace build: passed (config, domain, contracts, API, web).
- Default Compose rebuild: passed; API health 200 and web root 200.
- Full workspace Vitest: **not green due pre-existing local PostgreSQL boundary**:
  `34 files passed, 12 failed, 14 skipped; 150 passed, 12 failed, 38 skipped`.
  Failures were PostgreSQL authentication errors for local user `kelanach`, not
  this change; no unavailable result is claimed as passed.

## Cleanup

- No temporary source instrumentation, Playwright trace, report, or browser
  artifact was retained.
- Default Compose stack is intentionally left running for verification.
- Protected `.omo/plans/waha-command-center.md` and
  `.omo/start-work/ledger.jsonl` were not modified by this task.
