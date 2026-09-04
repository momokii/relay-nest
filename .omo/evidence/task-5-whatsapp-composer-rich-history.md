# Task 5: Sent history panel

## Implementation

- Added the scoped `sentHistory` method and Zod response schemas to
  `apps/web/src/dashboard-session-api.ts`.
- Added `SentHistoryPanel` with scoped fetching, loading/error/empty states,
  all canonical delivery states, 80-character escaped React text snippets,
  locale-formatted scheduled/created timestamps, truncated provider IDs, and
  pagination.
- Mounted the panel on Send and Schedule pages. Scope and send action keys
  remount the panel, preventing stale cross-scope rows and refreshing after a
  submission.
- Added responsive table styling using existing RelayNest design tokens.

## Verification

```text
npx --yes pnpm@10.12.4 typecheck
PASS

npx --yes pnpm@10.12.4 exec biome check apps/web/src/components/sent-history-panel.tsx apps/web/src/components/view-pages.tsx apps/web/src/dashboard-session-api.ts tests/sent-history.spec.ts
PASS

npx --yes pnpm@10.12.4 exec playwright test tests/sent-history.spec.ts --project=chromium --config=.tmp/playwright-t5.config.ts
PASS: 1 test

xvfb-run -a env T5_QA=1 npx --yes pnpm@10.12.4 exec playwright test tests/sent-history.spec.ts --project=chromium --config=.tmp/playwright-t5.config.ts --headed
PASS: 1 test; screenshot saved to /tmp/qa-t5.png
```

The Playwright regression covers direct send history visibility, escaped
snippet text, acknowledged state, pagination, and clearing on scope switch.
The route is `/scoped/sent-history`; no WAHA chat-history endpoint is used.
