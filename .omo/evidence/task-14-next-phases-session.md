# Todo 14 Slice 1 — Authenticated Session Dashboard Evidence

Date: 2026-08-19
Scope: authenticated session linking/create, current-scope behavior, lifecycle/status/recovery presentation, confirmation gates, and redaction.

## DoneClaim

**PASS for the session slice.** The existing authenticated API and WAHA adapter
contracts remain unchanged. The dashboard now composes the existing create route,
parses session-link input at the form boundary, refreshes only the active scope,
and presents existing lifecycle/status-history outcomes without exposing provider
credentials. No real WhatsApp link, QR credential, pairing credential, delivery,
or WAHA success claim was made.

## Changed files

- `apps/web/src/dashboard-session-api.ts` — exports the existing create schema for
  form-boundary parsing; no route or response shape change.
- `apps/web/src/session-controller.ts` — adds typed create action state and returns
  success to the dashboard refresh wrapper.
- `apps/web/src/dashboard-controller.ts` — adds scope-limited session refresh.
- `apps/web/src/app.tsx` — wires create success to the selected-scope refresh.
- `apps/web/src/components/dashboard-view.tsx` and
  `apps/web/src/components/dashboard-view-router.tsx` — pass create action and
  callback through existing page seams.
- `apps/web/src/components/session-page.tsx` — renders Admin-only linking,
  status/lifecycle/recovery states, and scope-keyed form reset.
- `apps/web/src/components/session-link-form.tsx` — new focused form using the
  existing Zod schema; no provider secrets or QR/pairing controls.
- `tests/task-14-dashboard-api.test.ts` — baseline lifecycle characterization.
- `tests/e2e/dashboard.spec.ts` — red-first linking, scope, status, lifecycle,
  recovery, confirmation, and redaction coverage.
- `tests/e2e/seed-fixture.ts` — adds a non-secret connection ID and deterministic
  status-only create response to the existing WAHA fixture.
- `.omo/evidence/task-14-next-phases-session.md` — this redacted record.

No protected plan, execution ledger, or `.claude/state/*` file was edited by this
slice. The pre-existing concurrent `.omo/boulder.json` and untracked plan were
preserved without modification.

## TDD transcript

### Baseline characterization — green before feature work

```text
npx --yes pnpm@10.12.4 exec vitest run tests/task-14-dashboard-api.test.ts
PASS — 1 file, 7 tests
```

The added baseline freezes the existing lifecycle URL, CSRF header, and
`{ action, confirmed }` payload at `createDashboardSessionApi().lifecycle()`.

### Missing dashboard behavior — red before production edits

```text
npx --yes pnpm@10.12.4 exec playwright test tests/e2e/dashboard.spec.ts --grep "open the authenticated session-linking form"
FAIL — authenticated setup, disposable PostgreSQL, deterministic WAHA, and dashboard load passed; expected heading "Link a session" was absent.
```

This failed at the missing dashboard behavior, not import, authentication,
migration, browser, or provider setup.

### Red→green focused browser result

After the implementation and the scope-key reset fix:

```text
E2E_DATABASE_URL=<REDACTED> E2E_AUTH_EMAIL=<REDACTED> E2E_AUTH_PASSWORD=<REDACTED> \
  npx --yes pnpm@10.12.4 exec playwright test tests/e2e/dashboard.spec.ts \
  --grep "session-linking form|provider recovery states"
PASS — 2 tests
```

The follow-up stale-feedback regression also followed red→green order. Before
the controller scope reset, the same test failed with `expected 0, received 1`
for the prior `The session was linked in this scope` notice after switching to
Business. After the controller reset and scope-keyed page, the exact command
above passed `2/2`.

## API and dashboard verification

### Existing authenticated backend seam

The existing integration test ran against a fresh PostgreSQL 17.6 container:

```text
DATABASE_URL=postgresql://<REDACTED> \
  npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
TASK14_AUTH_SESSION_DATABASE_URL=postgresql://<REDACTED> \
  npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-auth-session.integration.test.ts
PASS — 1 file, 2 tests
```

It verified Admin bootstrap/login/me, user creation, explicit grant, disable,
CSRF denial, session create/list/get, Personal/Business denial, lifecycle
confirmation, status history, QR/pairing safe response shapes, provider
unavailability as `502`, and absence of opaque connection values in responses.

### Focused adapter/model tests

```text
npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-dashboard-api.test.ts tests/task-14-dashboard-model.test.ts
PASS — 2 files, 12 tests
```

### Static and build checks

```text
npx --yes pnpm@10.12.4 exec biome check \
  apps/web/src/dashboard-session-api.ts apps/web/src/session-controller.ts \
  apps/web/src/dashboard-controller.ts apps/web/src/app.tsx \
  apps/web/src/components/dashboard-view.tsx \
  apps/web/src/components/dashboard-view-router.tsx \
  apps/web/src/components/session-page.tsx \
  apps/web/src/components/session-link-form.tsx \
  tests/task-14-dashboard-api.test.ts tests/e2e/dashboard.spec.ts \
  tests/e2e/seed-fixture.ts
PASS — 11 files checked; no fixes applied

npx --yes pnpm@10.12.4 --filter @waha-command-center/web build
PASS — Vite production build

npx --yes pnpm@10.12.4 --filter @waha-command-center/api build
PASS — TypeScript compile and esbuild bundle

npx --yes pnpm@10.12.4 --filter @waha-command-center/api exec tsx \
  /home/kelanach/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/dist/skills/programming/scripts/typescript/check-no-excuse-rules.ts \
  <11 changed TypeScript/TSX paths>
PASS — No violations in 11 files
```

The root typecheck was also run after the final scope-reset fix:

```text
npx --yes pnpm@10.12.4 typecheck
PASS — tsc -b --pretty false
```

An LSP diagnostics tool was not exposed in this execution environment; the
available strict compiler, Biome, and no-excuse checks were run.

The broader requested grep was run exactly:

```text
npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/task-14-admin-access.spec.ts tests/e2e/dashboard.spec.ts \
  --grep "session|lifecycle|grant|scope"
RESULT — 5 passed, 1 failed
```

The new session-linking/recovery test, existing lifecycle confirmation test, and
Admin grant/scope test passed. The unrelated failure was an existing AI
dashboard assertion for missing `Scope: business` content; no AI files were
changed.

## Real-browser QA

Browser: Playwright Chromium through the repository E2E runner, authenticated
same-origin dashboard URL `http://127.0.0.1:4173/`, with API proxying to the
disposable test API at `http://127.0.0.1:4317`.

Exact selectors and observable outcomes:

- `button[name="Sessions"]` opened the authenticated session page.
- `heading[name="Link a session"]`, `label["Connection ID"]`, exact
  `label["Session name"]`, and `label["WAHA session name"]` were visible.
- `GET /auth/me` and `GET /scoped/sessions?scope=personal` returned `200`.
- `GET /scoped/sessions/<seeded-id>/status-history?scope=personal` returned
  `200`; the empty state was `No status history`.
- `button[name="Logout"]` and `button[name="Delete"]` were disabled until the
  destructive confirmation checkbox was selected.
- `POST /scoped/sessions/<seeded-id>/lifecycle?scope=personal` returned `502`
  from the deterministic unavailable provider and the dashboard showed
  `Unavailable`, not success.
- Filling the three exact form labels and clicking `button[name="Link session"]`
  sent `POST /scoped/sessions?scope=personal`, returned `200`, and showed the
  server-accepted linked state.
- Changing `select[aria-label="Account scope"]` to `business` requested
  `GET /scoped/sessions?scope=business`, selected the Business seed, and reset
  the Personal connection ID form value to empty.
- Browser body assertions found neither `apiKey` nor `WAHA_API_KEY`; the create
  response was checked for no `connectionUrl` field.

No real provider credentials, QR value, pairing code, message content, or
recipient data was used in browser QA.

## Adversarial classes

- **Malformed input — applicable:** the new form uses `createSessionSchema.safeParse`; invalid UUID/name input stops before a request. Existing backend Zod integration remains unchanged.
- **Stale state — applicable:** a scope-keyed form reset prevents a Personal connection ID from being reused in Business.
- **Dirty worktree — applicable:** pre-existing protected and concurrent WIP changes were inspected and preserved; no reset, clean, commit, or push was used.
- **Long commands — applicable:** Docker/Playwright commands use bounded readiness loops, redacted environment values, and shell EXIT cleanup traps.
- **Flaky tests — applicable:** a retained E2E setup caused `409` bootstrap/login and left a task-owned API process; exact PIDs were terminated, a fresh isolated run was repeated, and the focused result passed `2/2`.
- **Misleading success output — applicable:** browser assertions checked HTTP statuses, accepted response shape, unavailable `502`, explicit unknown health/readiness, and no credential-shaped text.
- **Repeated interruptions — inapplicable:** no user interruption occurred; every disposable focused run used an EXIT cleanup trap. Shared concurrent runs were not interrupted to avoid unrelated-work damage.

## Cleanup

Focused disposable PostgreSQL containers were removed by exact shell EXIT traps;
the focused API processes and `.tmp/playwright` state were removed after each
isolated run. Task-owned focused traces were removed with:

```text
rm -rf .tmp/playwright test-results
```

At closeout, unrelated concurrent Playwright/Compose work was still running
and owned shared `test-results`/`.tmp/playwright` state plus containers with
names such as `task14-ai-approval-*` and `relaynest-e2e-*`. Those artifacts and
existing observability/WAHA containers were intentionally not terminated or
deleted. No real credentials or secret-bearing evidence was written.

## Risks and residual blockers

- The slice proves deterministic adapter/provider behavior, not a real WhatsApp
  account link or delivery.
- The broader dashboard grep remains partially blocked by an unrelated AI
  `Scope: business` assertion failure.
- Shared concurrent process/artifact cleanup must be completed by the owning
  orchestrator before final repository closeout.

## Post-fix exact Todo 1 grep rerun

Date: 2026-08-25. The earlier `5 passed, 1 failed` result above is retained as
historical pre-fix evidence. After the three Wave 1 blocker fixes were present
in the worktree, the exact protected-plan command was rerun unchanged:

```text
npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/task-14-admin-access.spec.ts tests/e2e/dashboard.spec.ts \
  --grep "session|lifecycle|grant|scope"
PASS — 7 tests (21.6s), 0 assertion failures
```

The passing set included Admin grant/scope denial, session linking/current-scope
behavior, the held Personal-create-to-Business switch, lifecycle confirmation
and provider-unavailable handling, status history, and no stale AI/scope
assertion. Playwright global teardown emitted the expected API child
`SIGTERM`; it was teardown noise after all seven tests passed, not a test
failure. No real WAHA account, QR/pairing credential, or recipient delivery was
used.

## Post-fix cleanup receipt

The 2026-08-25 focused verification removed its disposable database/API/WAHA
fixtures, task-owned Playwright results, temporary MCP browser/profile/log,
`.playwright-mcp`, and `.debug-journal.md`. Ports `4173`, `4317`, and `9222`
were free afterward; the pre-existing `4174` Vite preview and unrelated
containers were preserved. Protected plan, Boulder, ledger, and `.claude/state/*`
files were not edited by this verification.
