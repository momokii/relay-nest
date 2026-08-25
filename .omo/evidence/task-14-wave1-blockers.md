# Todo 14 Wave 1 blocker fixes

Date: 2026-08-25
Status: focused implementation verified; no commit or push performed.

## Scope

This artifact covers the three independent review blockers in the current
uncommitted Todo 14 work:

- stale session-create refresh after a Personal-to-Business scope switch;
- stale notification settings rendering during a scope switch;
- fabricated local AI suggestion text/ID/provider behavior.

No credentials, message content, provider payloads, database URLs, or opaque
identifiers are recorded here.

## Test-first evidence

1. Baseline characterization passed before the blocker regressions:
   `npx --yes pnpm@10.12.4 exec vitest run
   tests/task-14-dashboard-api.test.ts tests/task-14-ai-review-panel.test.ts`
   Result: `2 files, 12 passed`.
2. Regression tests were then run before production fixes. They failed for the
   intended reasons: the stale-scope guard and notification scope gate were not
   present, and the composer rendered the configured local suggestion ID/text.
3. After the fixes, the focused suite passed:
   `npx --yes pnpm@10.12.4 exec vitest run
   tests/task-14-dashboard-api.test.ts tests/task-14-ai-review-panel.test.ts
   tests/task-14-dashboard-model.test.ts tests/task-14-scope-race.test.ts
   tests/task-14-ai-approval-http.test.ts`
   Result: `5 files, 30 passed`.

## Browser verification

Command:

`npx --yes pnpm@10.12.4 exec playwright test tests/e2e/dashboard.spec.ts
--grep 'does not refresh a completed Personal session create into Business|uses
seeded sessions and keeps AI suggestion scope explicit|keeps unavailable AI
review from creating approval or dispatch requests'`

Result: `3 passed`.

The held-request scenario deferred a Personal session-create response, switched
to Business, verified the Business session remained selected and the held name
was absent, then released the response and rechecked the same boundary. The AI
scenarios verified explicit unavailable state, zero approval requests, and zero
dispatch requests.

Responsive capture:

`npx --yes pnpm@10.12.4 exec playwright test
tests/e2e/visual-capture.spec.ts`

Result: `1 passed`; screenshots and accessibility snapshots were refreshed at
375, 768, and 1280 CSS pixels. Manual MCP screenshots are retained at:

- `.omo/evidence/task-14-wave1-manual-375.png`
- `.omo/evidence/task-14-wave1-manual-1280.png`

The CDP-backed real browser pass found no horizontal overflow or secret-shaped
text at 375 or 1280. Its isolated preview had no API process, so `/auth/me`
returned the expected unavailable boundary; the only console errors were that
500 and the existing missing `/favicon.ico` 404. System Chrome was unavailable,
so MCP used the installed Playwright Chromium through CDP; this limitation is
not represented as a clean-console claim.

## Static/build verification

- Changed-file Biome: pass, 13 files checked.
- Workspace typecheck: `npx --yes pnpm@10.12.4 typecheck` pass.
- Web production build: `npx --yes pnpm@10.12.4 --filter
  @waha-command-center/web build` pass.
- Whitespace: `git diff --check` pass.
- LSP diagnostics: no LSP diagnostics tool was available in this session; no
  result is claimed. TypeScript compiler and Biome were run instead.

## Adversarial classes

| Class | Result |
|---|---|
| Malformed input | PASS: existing scoped AI HTTP cases cover malformed suggestion IDs, scopes, bodies, CSRF, origin, and roles; focused result is included above. |
| Stale state | PASS: typed generation unit regression, synchronous notification reset/gate, and held browser scope-switch race pass. |
| Dirty worktree | PASS: status was inspected first; protected plan, ledger, and `.claude/state/*` were not edited. Existing unrelated WIP remains untouched. |
| Long commands | PASS: build, typecheck, and Playwright commands completed within their bounded timeouts. |
| Flaky tests | PASS: the corrected three-test browser target and visual capture were rerun to green; no retries were used. |
| Misleading success output | PASS: tests assert response scope, selected Business session, unavailable AI state, zero approval requests, zero dispatch requests, and `sendState: "not_sent"` in the server contract. |
| Repeated interruptions | PASS: the deferred create test exercises an interrupted scope transition; task-owned API/web/CDP processes and ports were cleaned up. |
| Prompt injection | NOT APPLICABLE: this surface accepts no prompt-bearing external text. |

## Cleanup

- Task-owned API, Vite preview, CDP browser, and Playwright fixture processes
  stopped.
- Ports `4173`, `4317`, and `9222` verified free.
- `test-results/` and `.tmp/playwright/` absent after teardown.
- No unrelated Docker services or containers were stopped or removed.
- MCP logs/snapshots were removed; only redacted screenshot evidence remains.

## Remaining risks

- This focused run does not claim the full workspace Vitest/database matrix,
  full Biome, dependency audit, or unavailable external scanners.
- The AI UI intentionally remains unavailable until a real server-backed
  suggestion object is supplied; no generation path was added.
- The repository still contains pre-existing uncommitted Wave 1 changes and
  protected-record modifications from before this task.
