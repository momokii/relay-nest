# Todo 14 Slice 3 — Notifications and Retention Browser Acceptance

Date: 2026-08-19
Status: IMPLEMENTED AND FOCUSED-VERIFIED

All credentials, provider secrets, message content, opaque identifiers, preview
tokens, database URLs, and raw provider responses are redacted from this record.
No protected plan, Boulder, execution ledger, or `.claude/state/*` file was
changed by this slice.

## Changed surface

- `apps/web/src/dashboard-controller.ts` — uses the existing typed notification
  and retention adapters for scoped settings, list, preview, and purge flows;
  clears scoped resources during scope transitions to prevent stale projection
  display; confirmation remains explicit at the adapter boundary.
- `apps/web/src/components/notification-page.tsx` and
  `apps/web/src/components/notification-settings-form.tsx` — bind the safe
  notification settings projection to the Admin form and immediately replace
  entered provider credentials with server-returned masks after save.
- `apps/web/src/components/admin-pages.tsx` and
  `apps/web/src/components/dashboard-view.tsx` — use typed retention categories
  and purge inputs through the existing dashboard composition.
- `tests/e2e/dashboard.spec.ts` — baseline-preserving browser coverage for
  masked settings hydration, post-save masking, disabled-channel test state,
  history, preview cancellation, category-mismatched preview confirmation,
  confirmed purge, CSRF, and same-origin headers.
- `tests/e2e/task-14-admin-access.spec.ts` — authenticated Operator browser
  denial for Admin-only Notifications and Retention controls.

No API route, encryption, retention deletion, authorization, retry, provider,
or WAHA semantics were changed.

## Baseline and red proof

Baseline was run before production edits against the unchanged dashboard:

```text
E2E_AUTH_EMAIL=<fixture> E2E_AUTH_PASSWORD=<redacted> \
  npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/dashboard.spec.ts --grep "notification|retention"
PASS: 2 tests.
```

Failing browser proof was added before the first production edit:

```text
E2E_AUTH_EMAIL=<fixture> E2E_AUTH_PASSWORD=<redacted> \
  npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/dashboard.spec.ts --grep "hydrates the masked notification settings projection" \
  --workers=1
EXPECTED FAIL before fix: Email host expected the safe stored projection but
received an empty value after the authenticated settings read.
```

A later security assertion also locked the post-save masking requirement before
its form-state fix; transient shared-port collisions were not counted as test
results.

## Focused verification

Disposable PostgreSQL 16 was started with a generated local-only password,
migrated, used sequentially, and stopped with a shell trap. The exact secret
and URL are intentionally omitted.

```text
npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
PASS: fresh disposable migration.

npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-11-notifications-http.integration.test.ts --reporter=dot
PASS: 1 file, 1 passed.

npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-retention-http.integration.test.ts --reporter=dot
PASS: 1 file, 2 passed.

npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-dashboard-api.test.ts --reporter=dot
PASS: 1 file, 7 passed.

npx --yes pnpm@10.12.4 exec biome check \
  apps/web/src/dashboard-controller.ts \
  apps/web/src/components/dashboard-view.tsx \
  apps/web/src/components/notification-page.tsx \
  apps/web/src/components/notification-settings-form.tsx \
  apps/web/src/components/admin-pages.tsx \
  tests/e2e/dashboard.spec.ts \
  tests/e2e/task-14-admin-access.spec.ts
PASS: 7 files, no fixes/errors.

npx --yes pnpm@10.12.4 typecheck
PASS: workspace TypeScript build, exit 0.

npx --yes pnpm@10.12.4 --filter @waha-command-center/web build
PASS: Vite production build, exit 0.

git diff --check
PASS: no whitespace errors.
```

## Real browser acceptance

The browser runs used the repository Playwright Chromium setup, a disposable
PostgreSQL database, deterministic local provider fixture, authenticated cookie
state, and one worker to avoid concurrent shared-port interference.

```text
E2E_AUTH_EMAIL=<fixture> E2E_AUTH_PASSWORD=<redacted> \
  npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/dashboard.spec.ts --grep "notification|retention" --workers=1
PASS: 3 tests.

E2E_AUTH_EMAIL=<fixture> E2E_AUTH_PASSWORD=<redacted> \
  npx --yes pnpm@10.12.4 exec playwright test \
  tests/e2e/task-14-admin-access.spec.ts --grep "Admin creates" --workers=1
PASS: 1 test.
```

Observed browser outcomes:

- Admin settings save and fresh settings read populate safe fields and masked
  password/token/chat projections; response and DOM contain no raw provider
  secret values.
- Preferences save returns `204`; disabled notification test returns explicit
  `disabled` states and never presents delivery as success; history is reachable
  through the authenticated route.
- Retention preview requires the visible confirmation gate; cancel removes the
  confirmation controls without a purge; category mismatch returns safe `409`;
  a fresh matching preview confirms with `200`.
- Preview and purge requests carry the CSRF header and same-origin header.
- A Personal Operator sees role-denied Notifications and Retention surfaces with
  no provider or purge controls. Existing HTTP integration coverage proves
  Viewer denial and Business-only cross-scope denial.
- UI and API assertions inspect status/body contracts rather than trusting a
  success log; no raw provider failure payload or message content is rendered.

## Adversarial classes

- `malformed_input`: APPLICABLE and PASS. Existing notification HTTP coverage
  returns generic `400` for malformed settings; typed adapters parse responses;
  no Zod detail crosses the UI boundary.
- `stale_state`: APPLICABLE and PASS. Browser category mismatch returns `409`;
  existing retention HTTP coverage binds scope/category/cutoff/count/token and
  rejects stale or mismatched confirmation without deletion.
- `dirty_worktree`: APPLICABLE and PASS. Pre-existing protected/WIP changes were
  observed with `git status`; no reset, clean, stash, or overwrite was used.
- `long_commands`: APPLICABLE and PASS. Disposable migration, integration, web
  build, and browser commands completed within their bounded timeouts; no hung
  process was treated as success.
- `flaky_tests`: APPLICABLE and PASS. Early attempts collided with concurrent
  task-owned Playwright processes and were classified as harness failures, not
  product results. Final browser runs used one worker after the shared ports
  were free and passed.
- `misleading_success_output`: APPLICABLE and PASS. Browser assertions checked
  response status, CSRF/same-origin headers, masked response content, visible
  state, and scoped purge outcomes; disabled channels were not called success.
- `repeated_interruptions`: APPLICABLE and PASS. Failed/interrupted harness
  attempts terminated their API/fixture resources; no task-owned API process,
  E2E database, `.tmp/playwright`, or `test-results` artifact remained at the
  task-owned cleanup check.
- `prompt_injection`: NOT APPLICABLE. This slice adds no LLM prompt, external
  text generation, or provider-content processing surface.
- `secret_or_content_leakage`: APPLICABLE and PASS. API integration and browser
  assertions reject raw credential values; evidence contains placeholders only.
- `real_provider_delivery`: NOT APPLICABLE. No real SMTP, Telegram, WAHA, or
  WhatsApp account was used; deterministic fixtures only.

## Cleanup receipt

- Named disposable PostgreSQL container for focused notification/retention
  integration was stopped and removed by the shell trap.
- Successful Playwright runs removed their authenticated state, seed metadata,
  API process, deterministic provider fixture, and task-owned browser artifacts.
- Final task-owned checks found no listener on ports `4173` or `4317`, no
  `relaynest-e2e-postgres-*` or `task14-notifications-retention-postgres`
  container, and empty/missing task-owned `.tmp/playwright` and `test-results`.
- An unrelated concurrently running schedule QA process/container was observed
  during the session and intentionally not terminated or cleaned by this task.

## Limitations

- LSP diagnostics and the repository no-excuse script were unavailable in the
  exposed toolset; TypeScript, Biome, Vitest, Playwright, and production build
  gates were used instead. No unavailable tool is claimed as passed.
- The required five-lane post-implementation review skill was invoked, but its
  native `multi_agent_v1` orchestration tool is not exposed in this environment;
  no independent review PASS is claimed.
- Full workspace lint was not claimed; this slice ran changed-file Biome as
  required, while unrelated concurrent WIP remains outside the slice.
- No commit or push was performed.
