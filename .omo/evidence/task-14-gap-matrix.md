# Todo 14 Wave 1 Task 1 — Authenticated Acceptance Gap Matrix

Date: 2026-08-17
Scope: contract freeze only; no production behavior implemented

## Matrix

| Acceptance scenario | Existing route/service/web seam | Status | Evidence and test action |
|---|---|---|---|
| Authenticated bootstrap and login | `POST /auth/bootstrap`, `POST /auth/login`, `GET /auth/me`; `AuthService`; `tests/auth-http.integration.test.ts` | covered | Existing isolated-PostgreSQL HTTP tests cover secure cookies, malformed credentials, logout revocation, and rate limiting. |
| Admin creates a user | `POST /admin/users`; `AdminService`; `tests/auth-http.integration.test.ts` | covered | Existing authenticated Admin integration creates a user with scoped roles. |
| Admin grants a session | `POST /admin/grants`; `AdminService`; `tests/auth-http.integration.test.ts` | covered | Existing integration grants only the Personal session and verifies role/scope behavior. |
| Admin disables a user | `POST /admin/users/:userId/disable`; `AuthService`; `tests/auth-http.integration.test.ts` | covered | Existing integration disables the Viewer and proves the active session is revoked. |
| Authenticated session linking | `POST /scoped/sessions`; `createScopedSessionService.create`; `apps/web/src/dashboard-session-api.ts` has no create method | blocked | Backend route/service exists, but the dashboard adapter and authenticated browser acceptance do not compose linking. No red duplicate was added. |
| Session status | `GET /scoped/sessions`, `GET /scoped/sessions/:sessionId`, `GET .../status-history`; `createScopedSessionService` | covered | Existing session service/HTTP tests cover scoped reads, unavailable WAHA mapping, and status history; browser evidence is preview-only. |
| Session lifecycle | `POST .../lifecycle`; `createScopedSessionService.lifecycle`; `session-controller.ts` | covered | Existing service/HTTP and browser confirmation-gate coverage exercise lifecycle actions; backend-backed E2E remains a final-gate risk. |
| Restart recovery | Scheduler `recoveryCode`/delivery-state services; no dashboard-backed recovery/job-detail route | blocked | Scheduler unit coverage exists, but no authenticated dashboard route exposes persisted recovery after restart. The schedule-detail red contract includes recovery-state visibility. |
| Immediate individual text send | `POST .../messages/immediate`; messaging service and HTTP integration | covered | Existing messaging HTTP/service tests cover consent, CSRF, scope/grant authorization, precise delivery states, and no duplicate dispatch. |
| Schedule list | Scheduler repository `find`/`claimDue`; no authenticated HTTP/web list seam | missing | `tests/task-14-schedule-contracts.integration.test.ts` expects the scoped collection route and fails at the current 404. |
| Schedule detail with recovery state | Scheduler repository `find`; no authenticated HTTP/web detail seam | missing | Same focused red test freezes detail output as the persisted job/recovery seam; no message content is placed in evidence. |
| Schedule edit | Scheduler repository `edit`; no authenticated HTTP/web mutation seam | missing | Focused red test expects a CSRF/same-origin-protected edit operation and currently receives 404. |
| Schedule cancel | Scheduler repository `cancel`; no authenticated HTTP/web mutation seam | missing | Focused red test expects cancellation through the authenticated scope seam and currently receives 404. |
| Failure notification settings | `GET/PUT /admin/notifications/:accountScope/settings`; notification service | covered | `tests/task-11-notifications-http.integration.test.ts` covers Admin authorization and masked settings. |
| Failure notification history | `GET /admin/notifications/:accountScope/history`; notification service | covered | Existing notification HTTP integration covers authenticated history reads and redaction. |
| Notification test-send | `POST /admin/notifications/:accountScope/test`; notification providers/service | covered | Existing integration covers disabled-channel behavior and zero provider calls. |
| Retention preview | `POST /admin/retention/:accountScope/preview`; retention service | covered | `tests/task-12-http.integration.test.ts` covers authenticated Admin/CSRF preview and scoped counts. |
| Retention cancellation | `POST .../purge` with `confirmed: false`; retention service | covered | Existing integration asserts `409` and no deletion before confirmation. |
| Retention confirmation | `POST .../purge` with preview token and `confirmed: true`; retention service | covered | Existing integration covers stale-token rejection, confirmed deletion, and scope checks. |
| Business-vs-Personal denial | Auth/session/messaging/analytics authorization and scoped repositories | covered | Existing auth, messaging, analytics, and baseline tests assert denial without sensitive IDs, metrics, or content leakage. |
| Provider-agnostic AI approval | Local `createAiApproval`/`AiReviewPanel` fixture only; no API provider/approval route or dispatch seam | missing | `tests/task-14-ai-approval-contract.integration.test.ts` expects scoped approval to return `approved` + `not_sent`; current app returns 404. |
| Keyboard/a11y smoke | React dashboard components and Playwright accessibility snapshots | covered | Existing Todo 14 browser evidence covers named scope control, landmarks, drawer focus behavior, and approval output. |

## Red-test interpretation

Only the rows marked `missing` have new red tests. `blocked` means a lower-level
seam exists but the authenticated dashboard-backed contract is incomplete; it is
not represented as a fabricated route or as a passing demo assertion.

The red tests require a disposable PostgreSQL URL supplied through
`TASK14_DATABASE_URL`. They do not use the ambient workstation database, real
credentials, WAHA, message content, or provider secrets.

The plural schedule paths and scoped AI approval path are explicit contract
freeze targets derived from the existing scheduler repository methods,
messaging route conventions, and the documented Todo 14 acceptance gap. They
are not claims that a production route already exists.

## Adversarial classes

- Unauthenticated and missing-CSRF requests are retained in the existing auth,
  messaging, notification, analytics, and retention suites.
- Cross-scope and missing-grant denials must not disclose opaque session IDs,
  message metrics, message/contact content, or provider credentials.
- Delivery states remain distinct; `WORKING`/HTTP acceptance is not delivery.
- Retention cancellation must delete zero rows; confirmation must require the
  exact preview token/count/cutoff.
- AI approval contract must return `approved` with `not_sent`; its eventual
  implementation must not call a dispatch seam.
- Test data is disposable and all message/provider values are opaque placeholders.

## Cleanup receipt

The focused commands use a disposable PostgreSQL container named by the command,
then remove it with `docker rm -f` in the verification transcript. No Compose
service, protected plan/ledger/state file, production source, or unrelated test
was changed by this task.

## Verification transcript

### Static checks

```text
npx --yes pnpm@10.12.4 exec biome check \
  .omo/evidence/task-14-gap-matrix.md \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-ai-approval-contract.integration.test.ts
```

Result: `Checked 2 files in 9ms. No fixes applied.`

```text
npx --yes pnpm@10.12.4 typecheck
```

Result: exit `0`.

Pure LOC: schedule contract test `141`; AI contract test `45`.

### Intentional red run

The following command used PostgreSQL 17.6 in disposable container
`task14-authenticated-postgres` on host port `55434`. The password and all
generated identifiers are omitted here.

```text
docker run -d --name task14-authenticated-postgres \
  -e POSTGRES_DB=waha_command_center -e POSTGRES_USER=task14 \
  -e POSTGRES_PASSWORD=<REDACTED> -p 55434:5432 postgres:17.6-alpine
DATABASE_URL=postgres://task14:<REDACTED>@127.0.0.1:55434/waha_command_center \
  npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:migrate
TASK14_DATABASE_URL=postgres://task14:<REDACTED>@127.0.0.1:55434/waha_command_center \
  npx --yes pnpm@10.12.4 exec vitest run \
  tests/task-14-schedule-contracts.integration.test.ts \
  tests/task-14-ai-approval-contract.integration.test.ts
docker rm -f task14-authenticated-postgres
```

Migration result: `migrations applied successfully`.

Red result: `2 failed files; 5 failed tests; 0 passed`. All failures were
intentional contract failures after authenticated bootstrap, with the exact
assertion `expected 404 to be 200`:

```text
FAIL tests/task-14-schedule-contracts.integration.test.ts
  lists scoped schedules through an authenticated session seam
    expected 404 to be 200
  returns schedule detail with persisted recovery state
    expected 404 to be 200
  edits a future schedule only through the authenticated mutation seam
    expected 404 to be 200
  cancels a future schedule without crossing account scope
    expected 404 to be 200

FAIL tests/task-14-ai-approval-contract.integration.test.ts
  approves a scoped provider suggestion without dispatching a message
    expected 404 to be 200
```

The server logs classified each response as `Route ... not found`; no test
failed during import, migration, fixture setup, authentication, or database
connection. The initial shell cleanup used a zsh-reserved variable name after
the test process exited; the container was subsequently removed successfully
with `docker rm -f task14-authenticated-postgres`, and no matching container
remained in `docker ps`.

The strengthened rerun retained the same red result after adding response-shape,
recovery-state, and persisted-cancellation assertions behind the expected
successful status checks. Those assertions are therefore ready to fail on an
incorrect future implementation without changing the current missing-route
failure classification.
