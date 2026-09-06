# G5 Campaign CRUD API evidence

## Focused verification

Command:

```text
npx --yes pnpm@10.12.4 exec vitest run apps/api/src/campaigns-http.test.ts
```

Result: 1 test file, 4 tests passed.

Covered behaviors:

- Personal scope returns only its campaign projection.
- Business scope returns an empty page when no Business campaigns exist.
- `pageSize=100` is capped to 50.
- A Viewer without a campaign grant receives HTTP 403.

## Static verification

Scoped Biome passed:

```text
npx --yes pnpm@10.12.4 exec biome check apps/api/src/campaigns-http.ts apps/api/src/campaigns-http.test.ts apps/api/src/app.ts
```

Workspace typecheck was run but remains blocked by pre-existing TS4111 errors in
`app-session-service.ts`, `waha/sessions.ts`, and `waha/webhook-http.ts`.

## Manual QA

The requested redacted curl create/list probe was captured at `/tmp/qa-g5.json`
using an invalid placeholder auth cookie. The local endpoint redirected to login
(HTTP 302), so authenticated create/list QA could not be completed without a
running API session. No secret or campaign content was recorded.

## Security notes

Campaign responses use an explicit safe projection and do not include encrypted
message fields or provider credentials. Scope is taken from the validated query
parameter and passed to the service; service grant enforcement is required
before any protected campaign read or mutation.
