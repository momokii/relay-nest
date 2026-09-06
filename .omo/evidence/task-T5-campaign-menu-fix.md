# T5 campaign delete menu fix

Verification refreshed 2026-09-05. Existing worktree changes from the campaign
menu slices were preserved; this task records their verification without touching
the protected plan or ledger.

## Change

- `createCampaignApi.remove` sends `DELETE /scoped/campaigns/:id?scope=...`
  and validates the `{ ok: boolean }` response.
- `CampaignList` renders `Delete` only when `isTerminal(campaign)` is true;
  scheduled rows retain `Cancel`.
- `CampaignPage` passes the already scope-filtered session list and calls
  `api.remove(scope, id)`, then reloads campaigns and contact groups.
- The existing server route remains deny-by-default, creator-scoped, same-origin,
  and CSRF-protected. No ciphertext is rendered or logged.

## Focused RED/GREEN

The requested focused command was run before the UI patch. It did **not** go RED:
the existing test named `delete removes terminal campaigns` was already a
server-service test and passed while the UI wiring was absent.

Pre-change command result:

```text
✓ tests/campaign-delete.test.ts (12 tests | 11 skipped)
Tests 1 passed | 11 skipped (12)
Checked 4 files in 14ms. No fixes applied.
```

Post-change focused command (selected test passed; workspace typecheck then hit an
unrelated out-of-scope API error):

```text
✓ tests/campaign-delete.test.ts (12 tests | 11 skipped)
Tests 1 passed | 11 skipped (12)
apps/api/src/campaigns.ts(152,48): error TS2339: Property 'subject' does not exist on type 'Readonly<{ readonly id: string; readonly name?: string | undefined; }>'.
Checked 4 files in 51ms. No fixes applied.
exit=1
```

Full campaign delete test file:

```text
✓ tests/campaign-delete.test.ts (12 tests)
Test Files 1 passed (1)
Tests 12 passed (12)
```

Related campaign regression files (`campaign-view`, `campaign-cancel`,
`campaigns-http-regression`, and `campaign-delete`) passed `31/31`.
`npx --yes pnpm@10.12.4 docs:check` exited `0`.

## Verification

```text
npx --yes pnpm@10.12.4 typecheck
apps/api/src/campaigns.ts(152,48): error TS2339: Property 'subject' does not exist on type 'Readonly<{ readonly id: string; readonly name?: string | undefined; }>'.
exit=1

npx --yes pnpm@10.12.4 exec biome check \
  apps/web/src/campaign-api.ts \
  apps/web/src/components/campaign-list.tsx \
  apps/web/src/components/campaign-page.tsx
Checked 3 files in 672ms. No fixes applied.
exit=0

npx --yes pnpm@10.12.4 --filter @waha-command-center/web build
vite build: ✓ 1903 modules transformed; ✓ built in 2.91s; exit=0

npx --yes pnpm@10.12.4 exec tsc -p apps/web/tsconfig.json --noEmit --pretty false
exit=0

git diff --check -- .claude/state/CURRENT_STATUS.md \
  .omo/evidence/task-T5-campaign-menu-fix.md \
  apps/web/src/campaign-api.ts apps/web/src/components/campaign-list.tsx \
  apps/web/src/components/campaign-page.tsx
exit=0

Pure LOC audit: campaign-api.ts 170; campaign-list.tsx 128; campaign-page.tsx 79.
The TypeScript no-excuse checker path referenced by the programming skill is not
present in this repository, so it was not claimed as passed. LSP diagnostics are
not available in this harness.
```

The attempted unscoped `pnpm test -- tests/campaign-delete.test.ts` command
expanded to the repository suite and is not treated as campaign verification.
It exposed pre-existing environment/unrelated failures: workstation PostgreSQL
password authentication, missing test encryption key, DOMParser unavailable in
SSR tests, stale release-doc expectations, and unrelated message-shape tests.
The direct Vitest file command above is the authoritative full-file result.

## Manual curl captures

The disposable stack was healthy (`api`, `postgres`, `waha`, and `web` up). Host
curl through the web proxy captured only protected boundary responses because no
authenticated operator cookie/CSRF fixture was available; no campaign IDs,
cookies, keys, or message content were exposed.

Unauthenticated same-origin DELETE:

```text
HTTP/1.1 401 Unauthorized
content-type: application/json; charset=utf-8
{"error":"unauthenticated"}
```

Cross-origin DELETE with an invalid CSRF token:

```text
HTTP/1.1 403 Forbidden
content-type: application/json; charset=utf-8
{"error":"forbidden"}

Malformed UUID without credentials (authentication is intentionally checked first):

```text
HTTP/1.1 401 Unauthorized
content-type: application/json; charset=utf-8
{"error":"unauthenticated"}
```
```

Authenticated create/cancel/delete curl QA and visual row-disappearance proof
remain blocked by the missing disposable authenticated fixture. Playwright could
not start because the host lacks `/opt/google/chrome/chrome` and the harness does
not install it. The focused HTTP/service tests cover terminal deletion, scheduled
rejection, cross-user 403, same-origin, CSRF, malformed UUID, and ciphertext
non-disclosure. Web root and proxied health both returned HTTP 200.
