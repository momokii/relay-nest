# T8: Pagination, retention, and ordering

## Automated verification

- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts -t "pagination"`
  - PASS: 2 tests passed (5 skipped by selector).
- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts`
  - PASS: 7 tests passed.
- `npx --yes pnpm@10.12.4 typecheck`
  - PASS.
- `npx --yes pnpm@10.12.4 exec biome check apps/api/src/sent-history.ts apps/api/src/db/repositories/sent-history.ts apps/api/src/sent-history.test.ts`
  - PASS.
- `git diff --check -- apps/api/src/sent-history.ts apps/api/src/db/repositories/sent-history.ts apps/api/src/sent-history.test.ts`
  - PASS.

## Covered behavior

- `page` defaults to 1 and rejects negative values with HTTP 400.
- `pageSize` defaults to 20 and is capped at 50, including repository-level bounds.
- History reads remain ordered by `scheduled_jobs.created_at DESC` with `id DESC` as a deterministic tie-breaker.
- Projected snippets are limited to 80 characters and full message text remains absent from the response.
- The existing `messages` retention category purges `scheduled_jobs` and its `dispatch_attempts`; an empty post-purge list is represented as an empty history page.
- Backup export/expiry remains a separate lifecycle from live retention purge.

## Manual QA

The running development surface redirected unauthenticated requests to login. The
redacted response capture is `/tmp/qa-t8.json`:

```text
curl --silent --show-error --max-time 10 -o /tmp/qa-t8.json -w 'HTTP %{http_code}\n' \
  'http://127.0.0.1:3000/scoped/sent-history?scope=personal&page=2&pageSize=100'
HTTP 302
```

The API route therefore could not be inspected live without an authenticated
session; authenticated pagination and cap behavior are covered by the focused
Fastify route tests above.
