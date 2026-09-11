# task-16 — waha-finalize-15-16 evidence

## Todo 5 — Run lint/typecheck/test and fix defects in scope (2026-09-10)

Scope honored: fixes were limited to making the three gates green and to the
regression surfaces they exposed (web dashboard/composer controllers, API
messaging/session/analytics repositories and their tests, release checker
scripts, Biome include configuration). No `as any`, `@ts-ignore`, or
`@ts-expect-error` was introduced; `git diff | grep -cE "as any|@ts-ignore|@ts-expect-error"`
returned `0`. No scope expansion into media, campaigns, broadcasts, recurring
jobs, Redis, or autonomous sending. Nothing committed or pushed.

### Automated gates

```text
npx --yes pnpm@10.12.4 lint 2>&1 | tail -20
PASS: exit 0, "Checked 324 files", no errors, no warnings.

npx --yes pnpm@10.12.4 typecheck 2>&1 | tail -20
PASS: exit 0, `tsc -b --pretty false` silent.

npx --yes pnpm@10.12.4 test 2>&1 | tail -30
PASS: exit 0 — "Test Files  101 passed (101)", "Tests  559 passed (559)".
`grep -q "Test Files.*passed"` matches with 0 failed and 0 skipped, so the
acceptance grep is not a false positive.
```

Full-suite stability: `pnpm test` was run to green twice consecutively
(101/101 files, 559/559 tests each) on freshly recreated, migrated disposable
PostgreSQL databases, plus two earlier green runs during fix iteration
(99 files / 556 tests and 100 files / 559 tests before the last two fixture
fixes were folded in). Earlier runs in this task failed exactly as documented
below and were rerun only after fixes.

Environment for DB-backed integration files (per the Todo 12 evidence
convention): disposable `postgres:16-alpine` container on
`127.0.0.1:55432` (non-default port; the host's own Postgres rejects the
default fallback user), fresh database per run, `pnpm db:migrate` applied, and
`DATABASE_URL`, `TASK5_AUTH_DATABASE_URL`, `TASK11_DATABASE_URL`,
`TASK12_DATABASE_URL`, `TASK13_DATABASE_URL`,
`TASK13_ANALYTICS_DATABASE_URL`, `TASK14_DATABASE_URL`,
`TASK14_AUTH_SESSION_DATABASE_URL` (all one redacted disposable URL),
`RUN_POSTGRES_TESTS=1`, and `ENCRYPTION_MASTER_KEY` (throwaway random
base64 32-byte key) exported for the run only.

### Manual-QA

```text
npx --yes pnpm@10.12.4 exec vitest run tests/users-table.test.ts
PASS: exit 0, "Test Files  1 passed (1)", "Tests  3 passed (3)".
```

(The plan's literal `pnpm test -- users-table` form does not forward the
filter through pnpm 10; the equivalent direct vitest invocation above was used
and is what the focused command intends.)

### Defects found and fixed (all verified by the gates above)

1. `biome.json` — Biome traversed the `.codegraph` symlink and formatted
   system files under `/etc`, failing `pnpm lint` outside the repository.
   Folder ignores now use the traversal-preventing form (`!.codegraph`
   instead of `!.codegraph/**`), per Biome 2.x guidance. Lint went from 487
   scanned paths (including `/etc`, `/usr/share`) to 324 repository files.
2. `apps/web/src/dashboard-controller.ts` — `useExhaustiveDependencies`: the
   dashboard data effect read `analyticsWindow` without depending on it, so
   changing the analytics window from the UI never refetched analytics. Added
   `analyticsWindow` to the dependency list (real defect fix, not suppression).
3. `apps/web/src/schedule-history-controller.ts` — the reset-to-page-1 effect
   intentionally lists filter states as change triggers; annotated with a
   justified `biome-ignore lint/correctness/useExhaustiveDependencies`
   comment (existing repo convention), no behavior change (`page` starts at 1).
4. Formatting/import-order: `apps/api/src/contact-groups-http.ts`,
   `apps/api/src/waha/sessions.ts`, `tests/task-13-analytics-db-fixture.ts`,
   `apps/api/src/db/repositories.ts` (biome `--write`; the `sessions.ts`
   reflow was restructured to keep its suppression attached with identical
   semantics).
5. `apps/api/src/contact-groups.test.ts` — the repository tests deleted their
   fixture user while the user's contact group still referenced it, but
   `contact_groups_created_by_users_id_fk` is `ON DELETE no action`
   (`apps/api/drizzle/0010_contact_groups.sql`). The test had never run
   against a real database (its original evidence records the run was
   blocked by missing disposable credentials). Cleanup now removes the owned
   groups (members cascade) before the user.
6. `apps/api/src/db/repositories.ts` — `createRepositories(db)` threw
   `EnvelopeEncryptionError` at module load in seven integration test files
   because the contact-groups/campaigns repositories need a master key and
   the callers pass none. `masterKey` now defaults to
   `resolveEncryptionMasterKey(process.env)`; production (`app.ts`) still
   passes the key explicitly.
7. `apps/web/src/components/message-composer.tsx` — the send-preview render
   path unconditionally used browser-only `DOMParser`, crashing server-side
   renders in node-environment tests (6 failures across
   `tests/contact-send-redesign.test.ts` and
   `tests/task-14-ai-review-panel.test.ts`). Added the same
   `typeof DOMParser === "undefined"` guard idiom the file already uses for
   `localStorage`; browser behavior unchanged.
8. `tests/waha-session.test.ts`, `tests/waha-session-http.test.ts` — chat
   message expectations were missing the fields the current redacted contract
   returns (`id`, `hasMedia`, `mimetype`, `sender`, all `null`/`false` for
   these fixtures); expectations updated to the current
   `SessionChatMessageView` shape. Redaction assertions
   (`not.toContain` secret second line / `@c.us`) unchanged and still pass.
9. `tests/task-13-analytics-projection.test.ts`,
   `tests/task-13-analytics-operations.test.ts` — job fixtures omitted the
   now-required `scheduledFor`/`createdAt` (`AnalyticsJob` requires them;
   `methodVolume` reads `createdAt`), crashing `projectAnalytics`. Fixtures
   updated with type-complete, window-consistent values; existing assertions
   unchanged and pass.
10. `scripts/release-scope.mts` — the scope scan swept `.omo` agent records
    and failed on historical prose (a plan's "no scope bypass" guardrail
    phrase and evidence notes about earlier false positives — one file
    literally documents this false positive). `.omo` added to
    `EXCLUDED_DIRECTORIES` (Biome already excludes `.omo/**`); protected
    records were not rewritten. `pnpm verify:scope` now exits 0.
11. `tests/release-docs-links-fenced.test.ts` — the fenced-masking test
    hard-coded the flagged README line (`110`), coupling it to the README
    length before the Todo 3 docs refresh. The expected line is now derived
    from the copied README's actual length; the exact-line-preserved
    assertion is kept.
12. `tests/messaging-postgres.integration.test.ts` — the replay test's
    contact stub predated session-scoped contacts and omitted `sessionId`,
    so `resolveInternal` correctly returned `contact_not_found`. Stub
    completed; test passes against the current contract.
13. `tests/task-14-auth-session-fixtures.ts` +
    `tests/task-14-auth-session.integration.test.ts` — the fixture session
    repository lacked `createGrant`, so link-time creator grants (current
    production behavior) made `POST /scoped/sessions` return 409
    (`ScopedSessionError("unsupported")`). Fixture now persists the grant via
    `repositories.sessionGrants.create`. The test's follow-up explicit
    self-grant POST then duplicated the auto-grant (500 from the unique
    constraint on `admin.createGrant`); the test now asserts the auto-grant
    through `GET /admin/users` instead. This also un-skipped the file
    (previously skipped because `TASK14_AUTH_SESSION_DATABASE_URL` was not
    part of the documented run env): 2/2 passing, run three times.

### Adversarial review

- Suppression scan: `git diff` contains zero `as any`, `@ts-ignore`,
  `@ts-expect-error`. The two lint suppressions added are justified
  `biome-ignore` comments (items 3 above); item 7 removed a latent
  crash instead of suppressing it.
- Misleading success output: the acceptance grep
  (`pnpm test 2>&1 | grep -q "Test Files.*passed"`) would also match
  `14 failed | 70 passed`. The final logs were checked directly: zero
  `failed` counts, zero `FAIL` lines, exit 0 — the gate is genuinely green.
- Flaky tests: one transient failure of
  `tests/repositories.integration.test.ts` ("claims a due scheduled job
  atomically across concurrent workers", duplicate
  `dispatch_attempts_job_attempt_unique`) appeared once during a full-suite
  run and never in 3 isolated runs, 2 two-file runs, or any of the 4
  subsequent full-suite runs. The claim path is a single-statement
  `UPDATE ... WHERE state IN (scheduled, queued)` guarded by
  `SELECT ... FOR UPDATE SKIP LOCKED`, which serializes concurrent claims of
  the same job; no code change was made and the failure did not reproduce.
  Todo 8/F3 should re-run the full suite and treat a recurrence of this
  specific error as a blocker to investigate with statement logging.

### Cleanup

Disposable `todo16-test-postgres` container removed (`docker rm -f`), throwaway
key/password scratch files deleted, port 55432 released, debug probe test file
deleted. Existing RelayNest Compose services were left untouched. No commits
were made; all changes remain reviewable in the working tree.

---

## Todo 6 — Verify Settings/Users regression (portaled menus, WAHA creds, full-width) (2026-09-10)

Scope honored: verification-only todo. No product source changed — the one
temporary probe mutation to `user-access-page.tsx` (below) was reverted and
confirmed byte-identical to HEAD (`git diff` on the file empty) before the final
green re-run. No commits, no protected record edits, no scope expansion.

### Automated gates

```text
npx --yes pnpm@10.12.4 feature --test-file tests/users-table.test.ts \
  --test-name "renders the command table" \
  --paths apps/web/src/components/user-access-page.tsx \
          apps/web/src/components/admin-pages.tsx apps/web/src/styles.css
PASS: exit 0 — vitest "Tests  1 passed | 2 skipped (3)" (the named test ran
and passed; the 2 skips are the --test-name filter on the other two cases,
not hidden failures), `tsc -b` clean, scoped Biome clean.

node /tmp/opencode/users-ui-check.mjs 2>&1 | grep -q '"items":3'
PASS: exit 0. Per-row (not substring luck): firstRow/middleRow/lastRow each
items:3 (Grant session, Reset password, Disable), fullyInViewport:true at
1100x800; lastRow opensUp:true (menu y 370.39 + height 163 = 533.4, above the
trigger) — the last-row flip-up works. disableDialogOpened:true
(.chat-history-panel[aria-label^='Disable'] visible).
menusOpenByDefault:0; tableWrapScrollsHorizontally:true;
noPageHorizontalOverflow:true.

curl -s http://127.0.0.1:38080/assets/index-BGjixZ_0.js | grep -c 'WAHA credentials'
PASS: 1 match in the DEPLOYED web bundle (asset resolved from the live
index.html; the plan's `assets/*.js` glob is not portable to curl, the
resolved-asset form is equivalent). Local `apps/web/dist` serves the identical
asset hash `index-BGjixZ_0.js`, and `apps/web/dist/assets/index-BuiLH_OW.css`
contains `min-width:880px` and `.row-menu-list` (position:fixed portal styles).
```

### Manual-QA (Playwright)

Real-stack e2e (disposable Postgres + real API on 4317 + seeded WAHA fixture,
freshly built web on 4173, per `tests/e2e/global-setup.ts`):

```text
npx --yes pnpm@10.12.4 exec playwright test tests/e2e/users-row-menu.spec.ts
PASS: "1 passed (21.5s)", exit 0. Assertions exercised: menu portaled to
document.body, position:fixed, zIndex >= 60, bounding box fully inside the
1100x800 viewport, closes on outside click and on window scroll, document
does not overflow horizontally, Disable opens the confirmation panel.
```

Settings WAHA panel (admin, `/tmp/opencode/users-ui-check.mjs` against the
current dist with the exact `ConnectionSummary` shape `{id,name,baseUrl}`):
title "WAHA credentials — admin only" visible, connection "bundled-waha"
visible, baseUrl "http://waha:3000" visible, masked key
"API key •••• (Docker secret)" visible (screenshot
`/tmp/opencode/users-v4-settings-waha.png`).

Live-stack connection data source (read-only; no admin credentials available
to this agent, so no authenticated HTTP call was made):
`docker exec relaynest-postgres-1 psql ... -c "SELECT id,name,base_url FROM
waha_connections"` returns exactly one active row
`bundled-waha | http://waha:3000` — what `GET /admin/connections` serves. The
route (`apps/api/src/waha/connection-http.ts`) is admin-gated (401/403
covered by `tests/admin-connections-http.test.ts`, which also fixtures
`bundled-waha`) and returns only id/name/baseUrl; the API key never enters
the response surface, so browser-side masking is structural, and the UI adds
the `••••` display. Horizontal-scroll numbers at 1100x800 (mocked dataset):
wrap clientWidth 682 < wrap/table scrollWidth 889, `overflow-x:auto`,
`min-width:880px` — same invariant as the plan's recorded `682 < 1010` (the
1010 table width came from a wider seeded dataset; the invariant, not the
pixel pair, is the requirement).

### Failure-mode probe (plan QA scenario: revert `isLast`, assert regression is caught)

Temporarily replaced `shouldOpenUp = isLast || …` with
`shouldOpenUp = false || …` in `apps/web/src/components/user-access-page.tsx`,
rebuilt web, re-ran the checker: `lastRow.opensUp` flipped to `false` (menu
opened downward at y 592.39 instead of flipping up) while all other rows stayed
green — the check discriminates the exact `isLast` regression. Source
reverted (verified empty `git diff`), web rebuilt from HEAD, final re-run
green again (outputs quoted above are from that post-revert run).

### Adversarial review

- stale_state: the verified UI is the current code. Scoped sources
  (`user-access-page.tsx`, `admin-pages.tsx`, `styles.css`) have an empty diff
  vs HEAD `d123c23`; the deployed 38080 bundle and local dist share asset hash
  `index-BGjixZ_0.js` and contain the HEAD-only strings ("WAHA credentials —
  admin only", "Full data map — admin only", `min-width:880px`); the e2e run
  rebuilt the web bundle from current source before executing; the final
  checker run used a dist rebuilt after the probe revert.
- misleading_success_output: the feature gate's "1 passed | 2 skipped" was
  resolved to the named test actually running (skip is the name filter);
  `grep '"items":3'` was backed by per-row `items:3` and
  `fullyInViewport:true` fields, not substring coincidence; the e2e pass is
  assertion-backed (portal host, fixed positioning, zIndex, bounding box,
  close-on-click/scroll, disable panel), not just process exit; the curl
  grep counted matches in the resolved deployed asset, not an error page.

### Cleanup

Probe mutation reverted and rebuilt; e2e global teardown verified complete
(no `relaynest-e2e-postgres-*` containers, ports 4173/4317 released,
`.tmp/playwright` removed). Temp probe files removed:
`/tmp/opencode/t6-wrap-measure.mjs`, `/tmp/opencode/t6-probe-build.log`,
`/tmp/opencode/t6-final-check.json`. `/tmp/opencode/users-ui-check.mjs` kept —
the plan's acceptance criteria invoke it by path. No commits made; existing
RelayNest services untouched.

## Todo 7 — Secret-scan and scope-docs checks (2026-09-10)

Scope honored: verification only. No source, test, docs, or script file was
modified (temporary canary files used for negative controls were created under
repo root and removed the same run; `tests/users-table.test.ts` was restored
byte-identical, verified with `cmp`). Nothing committed or pushed.

### Automated gates

```text
pnpm secret-scan 2>&1 | tail -10
PASS: exit 0 — silent success (no diagnostics), pnpm banner only.

pnpm verify:scope 2>&1 | tail -10
PASS: exit 0 — silent success, pnpm banner only.

pnpm docs:check 2>&1 | tail -10
PASS: exit 0 — silent success, pnpm banner only.
```

Exit codes were captured directly from the pnpm process (`pnpm ... > file
2>&1; echo $?`), not from the `tail` pipe: with `tail -10` as the pipeline's
last stage, `$?` reports `tail`'s status and would mask a checker failure
(see Adversarial review). Final re-run after all negative controls confirmed
all three still exit 0 with no canary residue.

### Manual-QA — no `passwordHash` leakage in tests

- `grep -rn "passwordHash" --include="*.test.ts" tests/ apps/` finds only two
  kinds of occurrences:
  1. Server-side repository/integration fixtures constructing users with the
     opaque placeholder `passwordHash: "opaque-password-hash"`
     (`tests/repositories.integration.test.ts` x4, `tests/task-11-baseline.test.ts`,
     `tests/task-12-retention.integration.test.ts` x2) — schema-construction
     values, not real hash material.
  2. Negative assertions guarding the leak surface:
     `tests/users-table.test.ts:105` `expect(markup).not.toContain("passwordHash")`
     (Users table UI) and `tests/users-admin.test.ts:56`
     `expect(JSON.stringify(users)).not.toContain("passwordHash")` (admin API
     response).
- Filtering out those two kinds leaves zero occurrences: no real hash or
  secret-looking material in any `*.test.ts`.
- Focused run exercising the assertion:
  `pnpm exec vitest run tests/users-table.test.ts` — exit 0,
  `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- Scope isolation (`personal` vs `business`): `pnpm verify:scope` exit 0 with
  all three contract markers present — `CONTEXT.md:43` "Personal and Business
  scopes are never interchangeable.", `apps/api/src/auth/authorization.ts:30`
  `accountScope !== sessionScope → "scope_denied"`, and the regression
  assertion in `tests/authz.test.ts:59`.

### Adversarial review — misleading_success_output

- **Exit-code masking by `tail`:** the literal plan command
  `pnpm secret-scan 2>&1 | tail -10` reports the exit code of `tail`, which is
  0 even when the checker fails. All three gates were therefore re-run with
  the checker's exit code captured directly before any pipe; the PASS verdicts
  above are from those direct captures.
- **Vacuous-pass probe (do the scanners actually scan?):**
  - A temporary `zz-t7-secret-canary.txt` containing
    `WAHA_API_KEY=live-canary-abc123def456` made `secret-scan` exit 1 with
    `zz-t7-secret-canary.txt:1 secret-value remove secret material and inject
    it through the approved secret store`. File removed; re-run exit 0.
  - A temporary `zz-t7-scope-canary.txt` containing
    `cross-scope access is allowed` made `verify:scope` exit 1 with
    `zz-t7-scope-canary.txt:1 scope-separation keep Personal and Business
    account scopes strictly separate`. File removed; re-run exit 0.
  - With `--root` pointed at an empty directory, `verify:scope` and
    `docs:check` correctly exit 1 (`scope-contract-missing` / docs markers
    absent), but `secret-scan` exits 0 vacuously — nothing to scan counts as
    "no findings". This is inherent to a findings-based scanner and noted as a
    residual risk: `secret-scan` only means something when pointed at the real
    repo root (the pnpm script does; the canary probe above confirms active
    scanning of it).
- **Plan's stated failure scenario is inaccurate:** appending
  `passwordHash: "canary-secret-value"` to `tests/users-table.test.ts` did NOT
  fail `verify:scope` or `secret-scan` (both exit 0) — neither scanner has a
  `passwordHash` rule. The actual guard is the vitest `not.toContain`
  assertion inside the test file itself (`:105`, plus
  `tests/users-admin.test.ts:56`), verified passing 3/3 above. The line was
  then removed; `cmp` confirmed byte-identical restore and `git status` shows
  the file unmodified.
- docs gate non-vacuity: `docs:check` on the empty root exits 1, proving it
  actively validates contract markers rather than passing silently.

### Cleanup

Canary files (`zz-t7-secret-canary.txt`, `zz-t7-scope-canary.txt`) deleted;
`tests/users-table.test.ts` restored byte-identical (`cmp` pass, clean in
`git status`); `/tmp/opencode` scratch outputs and backup removed. No repo
files modified by this todo; no commits made.

---

## Todo 8 — Run e2e (schedule/restart/outage/463/475/purge/backup) against disposable stack (2026-09-11)

Scope honored: verification todo with e2e-spec maintenance only. The product
sources (`apps/web`, `apps/api`, `packages`) are untouched; the only repo
changes are four Playwright spec files (`tests/e2e/dashboard.spec.ts`,
`tests/e2e/schedule-dashboard.spec.ts`, `tests/e2e/schedule-race.spec.ts`,
`tests/e2e/task-14-admin-access.spec.ts`, `tests/e2e/visual-capture.spec.ts`)
whose expectations predated the committed session-link-form, combined
schedule-history, and Users/Settings UI redesigns. No commits made; nothing
pushed.

### Disposable-stack isolation (no production DB)

`E2E_DATABASE_URL` was explicitly unset for every run (`env -u
E2E_DATABASE_URL`), so `tests/e2e/global-setup.ts` took its default path:
a throwaway `postgres:16-alpine` container `relaynest-e2e-postgres-<pid>`
(`--rm`, random password, loopback-only published port), migrations applied,
API spawned on `127.0.0.1:4317` with `APP_ENV=test` and a throwaway
`ENCRYPTION_MASTER_KEY`, and the mocked WAHA fixture
(`tests/e2e/seed-fixture.ts`) on a random `127.0.0.1` port. The long-running
`relaynest`/`relaynest-dev` Compose containers and `main-local-postgres-dev`
were never referenced by the tests; global teardown stopped the disposable
container and API. The only host-side DB used by any check below is the
read-only `docker exec relaynest-postgres-1 psql` inspection for the compose
restart check.

### Command-form finding (plan command literal form)

`pnpm test:e2e -- --grep "<pattern>"` under pnpm 10.12.4 forwards the literal
`--` to the script: the executed command is
`playwright test -- --grep '…'`, the grep does NOT apply, and the FULL suite
runs. Verified twice (run headers captured in logs). The equivalent working
form used for the gate:

```text
npx --yes pnpm@10.12.4 exec playwright test --grep \
  "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"
```

`playwright test --list --grep "<same pattern>"` resolves exactly the 10
gate tests in 3 files. Both forms are green (the full suite is the superset).

### Automated gates

```text
playwright test --grep "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"
PASS: exit 0 — "10 passed (29.7s)" (final run); 3 additional consecutive
full-green runs before it (10 passed each: 29.4s / 29.3s / 29.4s).
Gate set: dashboard.spec creates/edits/cancels persisted Personal schedule,
one-time schedule validation copy, notification settings + masked
hydration, retention preview→purge; schedule-dashboard mixed-state rows,
cancel round-trip, delete confirmation gate, pagination; schedule-race
stale-detail guard.

pnpm test:e2e (full suite, no filter)
PASS: exit 0 — "23 passed (37.8s)" and again "23 passed (37.9s)".

Plan happy-path scenario:
playwright test tests/e2e/dashboard.spec.ts -g "creates, edits, and cancels a persisted Personal schedule"
PASS: exit 0 — "1 passed (23.1s)".

pnpm lint — PASS exit 0. pnpm typecheck — PASS exit 0 (spec updates only).
```

Exit codes were captured directly from the playwright/pnpm process, not from
a `tail` pipe (Todo 7 convention).

### Manual-QA — one scheduled send survives restart

(a) Disposable-stack, API process restart (temporary harness, removed after
the run): against the disposable Postgres + real API + mocked WAHA, a
schedule was created through the authenticated API
(`POST /scoped/sessions/<id>/messages/schedule` → 200,
`state: "scheduled"`, job `913c2976-5d58-4904-b4ed-1306b14da39e`), the API
process group was SIGTERM'd, the API was respawned against the SAME
database (env recovered from the process), `/health` polled green, and the
schedule re-fetched through the proxied dashboard origin: still
`state: "scheduled"` with the original `scheduledFor`. Logged
`T8_RESTART_SURVIVAL: … survived the API restart`; run exit 0, 1 passed.

(b) Compose restart + health (the plan's literal acceptance): with the
secret-file path env vars exported (file paths only; no secret content read),

```text
docker compose -p relaynest -f docker-compose.yml -f docker-compose.bundled-waha.yml --profile waha restart
```

all four containers came back and `docker compose -p relaynest … ps` shows
every service `healthy` (api/postgres/waha/web, verified twice after the
restart); the dashboard answers HTTP 200 on `127.0.0.1:38080`; the
`scheduled_jobs` table is queryable and byte-identical across the restart
(read-only psql count: 0 rows before and after — the live deployment
currently holds no pending jobs, and writing test rows into the production
database is out of bounds, so pending-row restart durability is evidenced by
(a) on the disposable stack instead).

### Defects found and fixed (all in stale e2e specs; product code untouched)

The suite had not run end-to-end since the committed session-link-form and
combined schedule-history redesigns; 13 of 23 specs were red against the
current UI. Fixes:

1. `schedule-dashboard.spec.ts` — mocked history items lacked the
   `origin` field added to `sentHistoryItemSchema` (Sep 6): items failed the
   web schema → panel showed "The API returned an unreadable response." Added
   `origin: "scheduled"`.
2. `schedule-dashboard.spec.ts` — pagination copy moved from
   "Page 1 · more available" to "Page 1 · 20 per page · more available";
   row now renders TWO status badges (origin + state), so the badge
   assertion is scoped with `hasText: ^state$` to stay strict-mode clean.
3. `schedule-race.spec.ts` — rewired to the current surface: list
   `/scoped/sent-history` (envelope `{items,page,pageSize,hasMore,total}`)
   and deferred `/scoped/sent-history/:jobId` details; the stale-response
   guard is asserted via the detail modal's "Scheduled for" text after the
   held first response resolves.
4. `dashboard.spec.ts:7/25/94` — the session-link form replaced the
   "Connection ID" textbox with a "Provider connection" select bound to
   `/admin/connections`; fills became `selectOption(connectionId)`, the
   capability-absent assertion now checks "Provider connections unavailable"
   count 0, and the per-scope empty-field assertion was dropped with the
   form redesign.
5. `dashboard.spec.ts:148` — composer session selector is now the
   "Authorized session" combobox (value = session id); heading is "Send an
   individual text".
6. `dashboard.spec.ts:229` — schedule creation now goes through recipient
   resolution ("Resolve target" → server consent) and the combined history
   table; list waits target `/scoped/sent-history?...origin=scheduled`, the
   created row is asserted in the table and opened via "View details for job
   <id>", edit/cancel still PUT/POST `/messages/schedules/...` (unchanged
   endpoints), Business isolation asserts an empty business history.
7. `dashboard.spec.ts:686` + `task-14-admin-access.spec.ts` — user
   creation/grant/disable moved behind confirmation modals and the row
   actions menu; flows updated (modal "Create a user", row menu →
   "Grant session" → session dropdown, row menu → "Disable" → confirm) with
   the same HTTP assertions (POST /admin/users 201 body shape, POST
   /admin/grants 204, POST /admin/users/:id/disable 204).
8. `visual-capture.spec.ts` — Overview now renders 6 metrics with info
   hints; count updated 4→6 and the strict single-line expectation replaced
   by the overflow/truncation invariant (`.metric-label`/`strong`
   scrollWidth ≤ clientWidth, all false).
9. Notification pair flake (400 on `PUT /admin/notifications/personal/settings`
   under parallel load, captured via trace: request body carried
   `host: ""`) — root cause: `NotificationSettingsForm`'s mount rebind
   effect can commit after a machine-speed fill under CPU saturation,
   clearing the field. `dashboard.spec.ts` now fills these forms through a
   `fillStable` helper (fill → settle → verify, retry), and 489's route hold
   is scoped to the PUT so the GET completes and the form binds stably.

### Adversarial review

- **Ghost-server near-miss / disclosure:** the first two full runs reused a
  stale `vite preview` on `127.0.0.1:4173` (config `reuseExistingServer:
  true`), which served a pre-redesign bundle with no API proxy — the source
  of "The API returned an unreadable response." (SPA-fallback HTML),
  "Connection ID" misses, and placeholder rows. Killed during diagnosis.
  **Disclosure:** two of the processes I terminated by command line were the
  in-container preview processes of the running `relaynest-web-1` and
  `relaynest-dev-web-1` Compose services (their internal port is 4173);
  Docker's restart policy brought both back and both report `healthy` (and
  were re-verified healthy again at the end of this todo). ~4 minutes of
  dashboard interruption on this machine; no data affected (volumes
  untouched). Lesson recorded: match processes by cgroup/container, not by
  command line, on this host.
- **flaky_tests:** the notification save 400 was reproduced 3× and then
  eliminated by the `fillStable` + PUT-hold fix (see defect 9); after the
  fix: 3 consecutive green full-gate runs, plus green full-suite (23/23)
  runs. No other test flaked across the final runs. `retries: 0` is
  config-pinned, so "passed" cannot hide retries. The Todo 5 note about the
  intermittent `dispatch_attempts_job_attempt_unique` failure did not
  recur in any run here.
- **misleading_success_output:** the plan's literal command silently ran
  the unfiltered suite (see command-form finding) — a red suite would have
  looked identical to a red gate; the working filtered form and its 10-test
  resolution are recorded above. `grep … "passed"` on a pipe was avoided;
  exit codes captured directly.
- **hung commands / leftovers:** verified after final runs — no
  `relaynest-e2e-postgres-*` containers, no stray e2e API (`--allow-loopback`)
  or vite preview processes on the host, ports 4173/4317 released,
  `.tmp/playwright` and `test-results` removed. (One earlier e2e API leak
  from a mid-diagnosis killed run was found and killed.)
- **prod-DB boundary:** every e2e run's container name, NOTICE-level
  postgres logs, and the absence of `E2E_DATABASE_URL` were re-checked; the
  two `docker exec relaynest-postgres-1 psql … SELECT` inspections are
  read-only.

### Cleanup

Temporary artifacts removed: `tests/e2e/zz-t8-restart.spec.ts` (restart
harness, output quoted above), `tests/zz-t8-probe.test.ts` /
`tests/zz-t8-seed.test.ts` (probes), the temporary `node_modules/zod` and
`node_modules/drizzle-orm` symlinks, disposable `t8-probe-pg` and
`t8-vitest-pg` containers, `/tmp/opencode` logs/traces/scratch, `test-results`
and `.tmp/playwright`. The relaynest/relaynest-dev Compose stacks are running
and healthy. No commits made; the five updated e2e specs remain reviewable in
the working tree.

---

## Todo 9 — Run audit and produce final evidence bundle (2026-09-11)

Scope honored: the only repo change is `pnpm-lock.yaml` (the audit-gate fix
below). The four `.omo/evidence/final-*.md` files were rewritten from their
2026-08-28 waha-command-center BLOCKED content into waha-finalize-15-16 F1-F4
placeholders — that content is git-tracked (last committed in `1d648bd`) and
recoverable from history; plan lines 136-139 assign those exact filenames to
this plan's F1-F4 and the acceptance count (`ls final-*.md | wc -l` = 4) pins
the reuse. `.claude/state/CURRENT_STATUS.md` updated per the todo. No
protected plan/ledger record was touched. No commit or push made (commit is
plan-flagged `Y` but requires explicit user authorization).

### Automated gate — audit

```text
npx --yes pnpm@10.12.4 audit --audit-level=high
FINAL: exit 0 — "4 vulnerabilities found / Severity: 4 moderate",
0 high, 0 critical.
```

Defect found and fixed en route to green:

1. The first audit run exited 1 with 8 high findings, all `fast-uri` —
   GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf,
   GHSA-jqff-g426-hqxp — via `apps/api>fastify>@fastify/ajv-compiler>fast-uri`
   (4.1.2, vulnerable `<4.1.3`) and `...>@fastify/ajv-compiler>ajv>fast-uri`
   (3.1.5, vulnerable `<3.1.6`). Root-cause fix, no override needed:
   `npx --yes pnpm@10.12.4 update fast-uri --recursive` moved the lockfile to
   the patched `fast-uri@3.1.7` / `fast-uri@4.1.4` within the dependents'
   declared ranges (`ajv@8.20.0`, `fast-json-stringify@6.4.0/7.0.1`,
   `@fastify/ajv-compiler@4.0.6`). `pnpm-lock.yaml` is the only changed file;
   `pnpm typecheck` exit 0 after the bump. The remaining 4 moderates are below
   the `--audit-level=high` threshold, so the gate is genuinely green, not
   silenced.

### Compose config collation inputs (executed for the final bundle)

With only file-path env vars exported (secret contents never read):

```text
docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.external-waha.yml config
PASS: exit 0 (113 lines)

docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha config
PASS: exit 0 (163 lines)

per mode: published: count = 1 (web only: host_ip 127.0.0.1, target 4173,
published "38080" from the local .env WEB_PORT override; committed default
8080), published: "3000" count = 0,
ENCRYPTION_MASTER_KEY=<value>/WAHA_API_KEY=<value> plaintext count = 0.
```

### Final evidence bundle

`.omo/evidence/final-plan-compliance.md` (F1), `final-security-quality.md`
(F2), `final-e2e.md` (F3), `final-scope-docs.md` (F4) — placeholders, each
stating PENDING for its gate, collating: the task-15 evidence (Todos 1-4),
the task-16 evidence (Todos 5-9), the compose config receipts above, and the
audit receipt. `ls .omo/evidence/final-*.md | wc -l` = 4.

### Adversarial review

- misleading_success_output: the audit gate was proven discriminating, not
  vacuous — the run immediately before the fix exited 1 with the 8 high
  fast-uri findings, and the post-fix run exits 0 with only moderates. Exit
  codes were captured directly from the pnpm process, not through a `tail`
  pipe. The `ls ... | wc -l` acceptance is count-4-exact, which also proves
  the placeholders were not stacked next to stale duplicates.
- stale_state: the rewritten final-*.md files are dated 2026-09-11, name this
  plan, and mark their gates PENDING — they cannot be mistaken for executed
  F1-F4 verdicts; the superseded 2026-08-28 BLOCKED audits remain in git
  history at `1d648bd`.

### Cleanup

Disposable Compose `config` invocations create no project resources (verified
in Todo 2); scratch files `/tmp/opencode/t9-audit*.txt`, `t9-cfg-*.yaml`,
`t9-cfg-*.err`, and the `t9-lockfile.bak` copy were removed. The running
relaynest/relaynest-dev operator stacks were untouched. No commits made.
