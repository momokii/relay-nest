# Sent-history projection rich-history fix

## Changes

- `apps/api/src/sent-history.ts` now projects the persisted `attempts` count.
- Message snippets now use the trimmed first line, truncated to 80 characters.
- `apps/web/src/dashboard-session-api.ts` validates `attempts` in the response schema so the value is retained at the API boundary.
- `apps/web/src/components/sent-history-panel.tsx` renders an Attempts column.
- `apps/api/src/sent-history.test.ts` covers attempts and newline/trim/truncation behavior.

## Verification

- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts` — passed, 9 tests.
- `npx --yes pnpm@10.12.4 typecheck` — passed.
- `npx --yes pnpm@10.12.4 exec biome check apps/api/src/sent-history.ts apps/api/src/sent-history.test.ts apps/web/src/dashboard-session-api.ts apps/web/src/components/sent-history-panel.tsx` — passed.
- The existing `apps/api/src/sent-history.test.ts` remains over the 250-line source guideline (269 pure lines); this task kept the regression in the existing projection test rather than expanding it with another test block.

## Manual QA

The running `relaynest-dev` API container was queried with:

```text
docker compose exec -T api node -e 'fetch("http://127.0.0.1:3000/scoped/sent-history?scope=personal").then(async r => { console.log(`HTTP ${r.status}`); console.log(await r.text()) })'
```

It returned HTTP 404 because the running container image predates this route (`Route GET:/scoped/sent-history?scope=personal not found`), so authenticated response-field verification was not available without rebuilding/restarting the disposable stack. No secrets or response data were exposed.
