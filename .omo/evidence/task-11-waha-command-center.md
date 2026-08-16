# Todo 11 Evidence — SMTP/Telegram Notifications

Date: 2026-08-17

## Changed files

- `apps/api/drizzle/0007_notifications.sql`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/src/app.ts`
- `apps/api/src/db/repositories.ts`
- `apps/api/src/db/repositories/notifications.ts`
- `apps/api/src/db/schema/operations.ts`
- `apps/api/src/db/schema/shared.ts`
- `apps/api/src/notifications/contracts.ts`
- `apps/api/src/notifications/http.ts`
- `apps/api/src/notifications/providers.ts`
- `apps/api/src/notifications/service.ts`
- `apps/api/src/notifications/settings.ts`
- `apps/api/src/notifications/types.ts`
- `tests/task-11-baseline.test.ts`
- `tests/task-11-notifications.test.ts`
- `tests/task-11-notifications-http.integration.test.ts`
- `tests/task-11-provider-mocks.test.ts`

No dependency was added. SMTP uses Node TCP/TLS primitives; Telegram uses Node HTTP(S) with the official Bot API `sendMessage` endpoint. Provider guidance followed RFC 5321/6409/8314 and the Telegram Bot API docs: 4xx SMTP and Telegram 429/5xx are transient; 5xx SMTP and malformed/invalid Telegram responses are permanent or unknown; all retries are capped at three attempts.

## Implementation evidence

- SMTP and Telegram settings are independently enabled per Personal/Business scope.
- Provider configuration is stored in one AES-256-GCM envelope per channel/scope using the existing `createEnvelopeCipher` implementation.
- GET responses return masked SMTP password, Telegram bot token, and chat IDs; provider payloads and credentials are not logged or returned.
- Settings, preferences, test sends, and history routes are server-side Admin-only and mutation routes require the existing CSRF proof.
- Categories are explicit: `security`, `delivery`, and `operations`.
- Disabled channels and disabled category/channel preferences skip enqueue and provider calls.
- Notification history remains in PostgreSQL with encrypted destination/body and safe state, attempt count, failure code, and redacted failure detail.
- Existing notification enqueue shape and content-free audit behavior are covered by the baseline characterization test before feature behavior.

## Verification results

Passing:

- `bunx biome check .`
- `bunx tsc -b --pretty false`
- `bunx vitest run tests/task-11-notifications.test.ts tests/task-11-provider-mocks.test.ts`
  - 14 passed across notification unit and provider boundary tests
- Fresh PostgreSQL migration via `drizzle-kit migrate` through `0007_notifications`
  - Both task-specific databases migrated successfully
- `TASK11_DATABASE_URL=... bunx vitest run tests/task-11-notifications-http.integration.test.ts`
  - Admin 200, unauthenticated 401, Operator 403, Viewer 403; 1 passed
- `TASK5_AUTH_DATABASE_URL=... bunx vitest run tests/auth-http.integration.test.ts`
  - 3 passed, repeated sequentially twice
- Full suite with `DATABASE_URL` and both isolated PostgreSQL databases:
  - 26 test files passed, 110 tests passed, repeated sequentially twice
  - Sequential execution is required because existing auth integration files share and truncate one database; parallel execution can deadlock or contaminate sessions. No production code change was made for that out-of-scope fixture issue.
- `bunx biome check .`
- `bunx tsc -b --pretty false`
- Direct API esbuild passed. The package `build` script delegates to `pnpm -r build`, but `pnpm` and the workspace Vite binary are unavailable in this environment; the web build could not be executed.

Audit limitation:

- `pnpm` is unavailable in this environment, so the required `pnpm audit --audit-level=high` could not run.
- `npm audit --audit-level=high --package-lock=false` also failed in npm dependency resolution before producing an audit result. No dependency was added by Todo 11.

## Manual/provider QA artifact

`tests/task-11-provider-mocks.test.ts` starts disposable local SMTP and Telegram HTTP servers. It asserts SMTP `EHLO`/AUTH/MAIL/RCPT/DATA/QUIT exchange, Telegram `/bot<token>/sendMessage` JSON semantics, no token in request body, and clean server shutdown.

`tests/task-11-notifications-http.integration.test.ts` uses a fresh PostgreSQL database and authenticated Fastify injection to verify Admin configuration/read, masked secrets, unauthenticated denial, Operator denial, and Viewer denial.

PostgreSQL state inspection after migration confirmed:

- `notification_preferences`
- `notification_provider_settings`
- `notifications`
- `notification_state` includes `queued`, `sent`, `failed`, and `attempting`

## Adversarial classes covered

- Missing authentication and non-Admin settings reads.
- Missing CSRF on mutation routes through the established auth boundary.
- Disabled email and Telegram channels: zero provider calls.
- Category preference disabled for a channel: zero provider calls.
- SMTP timeout: exactly three attempts, then failed state.
- Telegram malformed response: safe failure classification without provider response leakage.
- Permanent provider rejection: exactly one attempt.
- Ciphertext storage and wrong response projection: plaintext secrets absent.
- Content-free audit subject/action/scope values.
- Personal/Business setting repository scope separation.
- Migration replay/idempotent DDL.

## Cleanup

- Disposable PostgreSQL containers and the separate `task11_notifications` database were removed.
- Mock SMTP/Telegram servers close in `afterEach`.
- `/tmp/task11-api.cjs` and `apps/web/dist` were removed.
- No Todo 11 process, port, container, temporary secret, or generated build artifact remains.
- No commit or push was performed.

## Risks

- SMTP STARTTLS mode is not exposed in this MVP adapter; use implicit TLS (`secure=true`) for authenticated provider credentials. Port 587 deployments requiring STARTTLS need a follow-up adapter enhancement before use.
- Provider acceptance remains transport/provider acceptance evidence, not recipient-read/delivery proof.
- The repository’s existing parallel auth integration tests need database isolation or serial execution to make the full suite deterministic; this was not changed because it is outside Todo 11.
