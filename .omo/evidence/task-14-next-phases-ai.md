# Todo 14 Slice 4 — Human-Approved AI Approval Evidence

Date: 2026-08-19
Scope: connect the existing typed scoped AI approval adapter to the accessible
dashboard review checkpoint. This artifact is redacted and does not contain
credentials, database URLs, cookies, provider keys, message payloads, or prompt
content.

## DoneClaim

```yaml
status: IMPLEMENTED_AND_FOCUSED_VERIFIED
slice: Todo 14 slice 4
behavior: human-approved scoped AI review only
approval_result: approved=true, sendState=not_sent
provider_states: configured, unavailable
dispatch_result: zero messaging/scheduler/dispatch calls observed
protected_records: untouched
delivery: not committed or pushed
```

## Implementation

- `apps/web/src/components/ai-review-panel.tsx` now accepts an optional typed
  suggestion, scope, role, and approval action state. It exposes a labelled
  review region, opaque suggestion reference, provider state, proposed/rejected/
  approved status, keyboard-reachable approval/rejection controls, and a live
  `Send state: Not sent` result. No suggestion keeps the explicit unavailable
  state and no approval action.
- `apps/web/src/components/message-composer.tsx` owns only the existing typed
  `DashboardAiApi.approve` action. The opt-in `VITE_AI_SUGGESTION_ID` fixture is
  an opaque provider-agnostic review fixture; no generation provider, prompt,
  message-content source, scheduler, worker, or dispatch dependency was added.
- `apps/web/src/vite-env.d.ts` types the optional fixture setting.
- `playwright.config.ts` supplies the opaque fixture only to the browser
  build/preview process so the real-browser approval scenario is available;
  normal application builds without that setting remain unavailable.
- `tests/task-14-ai-review-panel.test.ts` covers available, unavailable, and
  configured-provider UI output. `tests/e2e/dashboard.spec.ts` covers the
  scoped browser approval interaction and counts non-GET `/messages/` plus the
  legacy dispatch path to prove no send/scheduler call.

## Test-first record

1. Baseline before edits:

   ```text
   npx --yes pnpm@10.12.4 exec vitest run \
     tests/task-14-ai-approval-http.test.ts \
     tests/task-14-ai-approval-contract.integration.test.ts
   PASS: 10 passed; 1 PostgreSQL-gated test skipped without its task URL.
   ```

   The existing browser characterization also passed:

   ```text
   npx --yes pnpm@10.12.4 exec playwright test \
     tests/e2e/dashboard.spec.ts --grep "AI|approval|not sent|unavailable"
   PASS: 1 test. Existing UI showed explicit unavailable state and no approval.
   ```

2. Red UI test before production changes:

   ```text
   npx --yes pnpm@10.12.4 exec vitest run \
     tests/task-14-ai-review-panel.test.ts
   FAIL: 1 test. The current panel rendered only the unavailable placeholder;
   it did not render the available opaque suggestion or approval action.
   ```

3. Green implementation result:

   ```text
   npx --yes pnpm@10.12.4 exec vitest run \
     tests/task-14-dashboard-api.test.ts \
     tests/task-14-dashboard-model.test.ts \
     tests/task-14-ai-review-panel.test.ts \
     tests/task-14-ai-approval-http.test.ts \
     tests/task-14-ai-approval-contract.integration.test.ts
   PASS: 25 passed; 1 skipped when no task-specific database URL was supplied.
   ```

   Against a disposable PostgreSQL 16 container with migrations applied, the
   same AI HTTP/panel set passed `13/13`, including the authenticated integration
   route. The container was stopped after the run.

## Contract and adversarial coverage

- Happy path: Admin/Operator approval returns the opaque suggestion ID, active
  scope, `approved: true`, explicit provider state, and `sendState: "not_sent"`.
- Configured provider: direct HTTP and panel coverage show `configured` while
  retaining `not_sent`.
- Unavailable provider: direct HTTP and real browser coverage show
  `unavailable` without fabricating provider success.
- Viewer and denied scope: existing direct AI HTTP tests return generic 403;
  no approval service call or result is exposed.
- Invalid CSRF and foreign Origin: existing direct tests return generic 403
  before the approval service; no messaging or scheduler spy is called.
- Malformed suggestion ID, scope, and body: existing direct tests return only
  generic `400 {"error":"invalid request"}` without Zod details.
- Stale scope: browser scope navigation verifies the current Business scope is
  rendered in the AI checkpoint after the Personal-to-Business switch; the
  scope-keyed composer does not retain the prior review action.
- No dispatch: direct service tests keep messaging and scheduler spies at zero;
  the real browser approval observed zero non-GET scoped messaging/scheduler or
  legacy dispatch requests.
- Prompt injection is not applicable: this slice accepts no prompt-bearing
  external text. The browser fixture contains only a fixed opaque suggestion
  reference, fixed kind, and provider-neutral display copy.
- Dirty worktree: pre-existing `.omo/boulder.json`, the untracked protected
  plan, and unrelated WIP files were preserved; no reset, clean, commit, or
  push was performed.
- Long commands/flaky or misleading output: the standard Playwright fixture
  was not counted as a pass after it failed to retain its relative
  `.tmp/playwright/auth.json` state. The approval was instead exercised by an
  isolated real Chromium run against disposable API/PostgreSQL, with the exact
  observable response and zero-call counter recorded below.
- Repeated interruptions: no task-owned process or browser artifact remains at
  closeout.

## Real-browser verification

The production web bundle was rebuilt with the opt-in opaque fixture and served
through Vite preview. A Playwright Chromium context bootstrapped an Admin,
opened Send, clicked the accessible `Approve suggestion` button, waited for the
scoped POST, and asserted the live `Approved, not sent` and `Send state: Not
sent` output.

Redacted result:

```text
browser approval PASS
status=200
providerState=unavailable
sendState=not_sent
nonGetMessagingOrDispatchRequests=0
```

The disposable browser PostgreSQL container, API process, preview process, and
temporary browser artifacts were cleaned up. The standard Playwright command
remains an environment/harness blocker only because its global setup loses the
relative storage-state file before workers start; no product failure is inferred
from that harness result.

## Static and build verification

```text
npx --yes pnpm@10.12.4 exec biome check <changed AI/UI/test files>  PASS
npx --yes pnpm@10.12.4 typecheck                              PASS
npx --yes pnpm@10.12.4 --filter @waha-command-center/web build   PASS
bun check-no-excuse-rules on changed TypeScript files          PASS
git diff --check                                              PASS
```

LSP diagnostics were unavailable in the exposed toolset and are not claimed.
Full workspace Vitest/lint and external security scanners were not claimed by
this slice. No secrets, provider dependencies, generation path, autonomous
worker, dispatch route, scheduler call, media, campaign, broadcast, or message
content logging was added.

## Cleanup receipt

- Disposable PostgreSQL containers used for integration/browser verification:
  stopped.
- Task-owned API/Vite/Playwright processes: stopped.
- `test-results/` and `.playwright-mcp/`: absent after cleanup. A later
  unrelated `schedule-dashboard.spec.ts` WIP run recreated the shared
  `.tmp/playwright/` directory; it and its running process were preserved
  rather than killed as unrelated work.
- `.debug-journal.md` belongs to that unrelated schedule-dashboard WIP and was
  preserved; it is not an AI-slice artifact.
- Protected `.omo/plans/*`, `.omo/boulder.json`, `.omo/start-work/ledger.jsonl`,
  and `.claude/state/*`: not edited by this slice.
