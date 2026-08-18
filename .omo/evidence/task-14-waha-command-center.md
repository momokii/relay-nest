# Todo 14 — WAHA Command Center Evidence

Date: 2026-08-17
Task: authenticated RelayNest dashboard UI and production-preview QA

## Result

**Final visual QA: PASS.** The two initial read-only reviews were reconciled as
follows:

- Pass A initially returned REVISE for three concrete issues: unnamed mobile
  scope selection, keyboard-reachable closed navigation, and stale session
  selection across scope changes.
- Pass B initially returned PASS for visual fidelity and layout.
- All three Pass A blockers were fixed and covered by browser regression tests.
- Final read-only inspection passed at 375, Schedule-375, 768, and 1280 CSS
  pixels. The desktop `Acknowledgments` label wraps within its metric card; it
  is fully readable and no longer clipped.

## Scope and safety behavior

- Personal and Business scope remains explicit in the selector, header, nav
  context, page eyebrow, API query paths, and scoped fixtures.
- Message and schedule forms remain text-only, consent-first, one-time, and
  bound to an authorized session.
- A keyed composer plus current-scope session derivation prevents a previous
  scope's session ID from being submitted after a scope change.
- AI approval remains human-gated. The UI announces `Send state: Not sent` and
  approval produces `Approved, not sent`; approval never dispatches.
- Demo, unavailable, unknown, and no-data states remain explicit; no delivery
  or aggregate claim is fabricated.

## Security follow-up

Post-review security regressions were fixed and covered:

- Consent updates now require the contact's `accountScope` and owning
  `sessionId`; cross-session consent mutation returns `{ updated: false }` and
  does not reach persistence.
- Durable idempotency records now carry `accountScope` and `sessionId`.
  In-memory and durable replay keys are bound to the principal/session/scope,
  and a mismatched durable result is not disclosed.
- Contact resolution now uses the same same-origin and CSRF mutation gate as
  immediate send, scheduling, and consent updates.

Passing security regression checks:

```text
npx pnpm@10.12.4 exec vitest run \
  tests/messaging.test.ts tests/messaging-http.test.ts tests/messaging-safety.test.ts
24 passed
npx pnpm@10.12.4 typecheck                         PASS
npx pnpm@10.12.4 --filter @waha-command-center/api build PASS
```

## Remaining Todo 14 acceptance blockers

The protected plan's Todo 14 acceptance criteria at
`.omo/plans/waha-command-center.md:217-223` remain open. The current slice
does not yet provide authenticated backend-backed Playwright coverage or
functional UI for:

- Admin bootstrap, user creation, revocation, and explicit grants.
- Authenticated backend-backed session linking, lifecycle/status operations, and
  restart recovery. The current session page is an explicit preview seam only.
- Authenticated schedule listing, job detail, edit, and cancel.
- Failure notification configuration/history/test-send behavior.
- Retention confirmation flow and server-backed scope denial for a
  Business-only Operator attempting Personal access.
- Provider-agnostic, scoped, opt-in AI provider contract beyond the local
  approval fixture.

These are intentionally recorded as remaining blockers; this evidence does
not claim Todo 14 is complete.

## Admin users and grants slice

The dashboard now composes the existing authenticated Admin routes without
inventing unsupported data:

- `apps/web/src/dashboard-admin-api.ts` parses and calls `/admin/users`,
  `/admin/grants`, and `/admin/users/:userId/disable` with credentials and the
  CSRF header supplied by the shared request boundary.
- `apps/web/src/admin-controller.ts` keeps create, grant, and disable action
  states separate and typed.
- `apps/web/src/components/user-access-page.tsx` exposes Admin-only create,
  grant, and disable forms; Viewer/Operator roles receive a denied state.
- The page explicitly states that list and grant-revocation routes are absent;
  it displays no user records, credentials, or fabricated grants.

Browser regression coverage in `tests/e2e/dashboard.spec.ts` now verifies the
three supported command surfaces, the no-list/no-revoke boundary, and the
unavailable API state on a valid create submission. It also verifies session
lifecycle confirmation gates and unavailable status history. The complete
production preview E2E run passed **6 tests**.

## Session lifecycle and status slice

The dashboard now exposes an explicit, scope-safe session control surface:

- `apps/web/src/dashboard-session-api.ts` parses scoped session lists, lifecycle
  actions, and status-history responses. Missing provider routes become the
  canonical unavailable state rather than fabricated success.
- `apps/web/src/session-controller.ts` keeps lifecycle and history action state
  separate, carries the selected account scope, and requires confirmation for
  logout/delete.
- `apps/web/src/components/session-page.tsx` exposes Start, Stop, Restart,
  Logout, Delete, and Load status history controls. Destructive controls are
  disabled until confirmation, and the selected session is derived from the
  current scope's list.
- `tests/e2e/dashboard.spec.ts` verifies the six-test browser flow, including
  confirmation gating, unavailable restart handling, and unavailable status
  history.

This slice is intentionally not claimed as authenticated backend completion:
the current API adapter reports unavailable for unsupported route contracts,
and authenticated session-linking/recovery integration remains a Todo 14
acceptance blocker.

## Accessibility and responsive fixes

- `apps/web/src/components/app-shell.tsx`
  - Added an explicit `Account scope` accessible name.
  - Added responsive `aria-hidden` and `inert` behavior for the closed mobile
    drawer without disabling the desktop rail.
  - Added Escape-to-close and focus return to the menu trigger.
- `apps/web/src/components/ui.tsx`
  - Added stable heading/description IDs to panels and associated section
    landmarks with `aria-labelledby`/`aria-describedby`.
- `apps/web/src/components/ai-review-panel.tsx`
  - Changed the approval state line to semantic live `<output>` markup.
- `apps/web/src/components/message-composer.tsx` and
  `apps/web/src/components/view-pages.tsx`
  - Filter the selected session to the active scope and remount the composer
    on scope changes.
- `apps/web/src/styles.css`
  - Made informational overlines neutral; amber remains reserved for safety,
    boundary, warning, and approval semantics.
  - Allowed metric labels/details to wrap inside narrow grid cards.
- `tests/e2e/dashboard.spec.ts`
  - Added Personal → Business session rebinding coverage.
  - Added closed-drawer `aria-hidden`/`inert`, Escape, and focus-return coverage.

## Browser evidence

Final screenshots:

- `.omo/evidence/task-14-dashboard-375-final.png`
- `.omo/evidence/task-14-dashboard-schedule-375-final.png`
- `.omo/evidence/task-14-dashboard-768-final.png`
- `.omo/evidence/task-14-dashboard-1280-final.png`

Final accessibility snapshots:

- `.omo/evidence/task-14-dashboard-375-final-accessibility.yml`
- `.omo/evidence/task-14-dashboard-schedule-375-final-accessibility.yml`
- `.omo/evidence/task-14-dashboard-768-final-accessibility.yml`
- `.omo/evidence/task-14-dashboard-1280-final-accessibility.yml`

Snapshot evidence confirms:

- Mobile and desktop expose `combobox "Account scope"`.
- Desktop exposes `navigation "Primary navigation"`.
- Schedule exposes named form controls, consent checkbox, and AI `status` with
  `Send state: Not sent`.
- Panels are exposed as named regions.

Visual inspection found no clipping or horizontal overflow at any required
viewport. The final browser session reported five expected console errors from
unavailable same-origin API routes and zero warnings; those responses are
classified into explicit unavailable/demo states.

The available objective self-diff artifacts from the earlier capture are:

- `.omo/evidence/task-14-image-diffs/375.json`
- `.omo/evidence/task-14-image-diffs/768.json`
- `.omo/evidence/task-14-image-diffs/1280.json`

Those report matching dimensions, zero changed pixels, intact alpha, and
100/100 similarity for their reference/actual pairs. The refreshed final
captures were visually inspected, but the repository does not contain the
`image-diff` executable (`image_diff_available=0`), so no new self-diff claim
is made for them.

## Verification

Passing checks:

```text
npx pnpm@10.12.4 typecheck                         PASS
npx pnpm@10.12.4 build                             PASS
npx pnpm@10.12.4 exec biome check <changed files>  PASS
npx pnpm@10.12.4 exec vitest run                  17 passed (focused Todo 14/security)
npx pnpm@10.12.4 test:e2e                         6 passed
npx react-doctor@latest --json                    exit 0, ok true, score 86
```

Full lint was run and did not pass because of the pre-existing Todo 13 file
`tests/task-13-analytics-db-fixture.ts`; Biome reported only import ordering and
formatting there. The exact redacted output is in
`.omo/evidence/task-14-full-lint.log`. No unrelated Todo 13 file was changed.

Full Vitest was run. Result: **125 passed, 23 skipped, 12 failed**. All 12
failures are PostgreSQL integration/migration tests failing before assertions
because the local PostgreSQL connection rejects the configured `kelanach`
password (`28P01`). This is an environment/database blocker, not a Todo 14
dashboard failure.

React Doctor found no errors and three maintainability warnings for intentional
test-facing exports in `apps/web/src/dashboard-model.ts`: `ROLES`,
`CAPABILITIES`, and `buildScopedPath`. The JSON artifact is
`.omo/evidence/task-14-react-doctor.json`.

LSP diagnostics were not available in the exposed toolset. TypeScript,
Biome, production build, Vitest, Playwright E2E, accessibility snapshots, and
React Doctor were used as the available diagnostics-equivalent gates.

## Browser and Lighthouse limitation

The required Playwright Chrome channel is unavailable at
`/opt/google/chrome/chrome`; installing it failed because `sudo` requires a
password. Browser evidence was captured through the existing CDP endpoint at
`http://127.0.0.1:9222`. No Lighthouse score is claimed. A real-Chrome mobile
and desktop Lighthouse run remains pending environment access.

## Cleanup and protected files

- No commit, reset, push, or protected plan/ledger/state rewrite was performed.
- Existing protected Todo 13 changes and `.omo/plans/waha-command-center.md`,
  `.omo/start-work/ledger.jsonl`, and `.claude/state/*` were preserved.
- Cleanup receipt: stopped the task-owned `vite preview`, Playwright MCP, and
  CDP Chromium processes; removed `.playwright-mcp/`, `test-results/`,
  `.debug-journal.md`, and `/tmp/relaynest-chrome-profile`.
- Final process check found no remaining task-owned preview, Playwright MCP, or
  Chromium process; final artifact check confirmed all four disposable paths
  are absent.
