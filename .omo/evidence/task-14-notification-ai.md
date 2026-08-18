# Todo 14 Wave 2 Task 4 — Notification, Retention, and AI Approval Evidence

Date: 2026-08-17
Scope: authenticated notification/retention contract proof and the frozen
provider-agnostic AI approval seam.

## Changed files

- `apps/api/src/ai/types.ts` — typed provider-agnostic approval/result contract;
  scope-bound input and explicit configured/unavailable provider state.
- `apps/api/src/ai/service.ts` — Admin/Operator scoped approval service. It has
  no messaging, scheduler, WAHA, provider invocation, or content logging
  dependency.
- `apps/api/src/ai/http.ts` — Zod-validated, same-origin, CSRF-protected
  `POST /scoped/ai/suggestions/:suggestionId/approve?scope=...` route.
- `apps/api/src/app.ts` — composes the default unavailable AI approval service
  and registers the route without changing scheduler routes.
- `tests/task-14-ai-approval-http.test.ts` — direct `app.inject` coverage for
  malformed path/query/body input, same-origin and CSRF gates, Viewer and
  denied-scope rejection, configured/unavailable provider states, and zero-call
  dispatch assertions.
- `tests/task-14-ai-approval-contract.integration.test.ts` — frozen-path
  PostgreSQL/auth regression test; fixed CSRF cookie parsing only.
- `tests/task-14-retention-http.integration.test.ts` — authenticated HTTP
  read/preview/cancel/confirm and cross-scope denial proof.

Existing notification implementation and routes were reused unchanged and
verified through `tests/task-11-notifications.test.ts` and
`tests/task-11-notifications-http.integration.test.ts`.

## Contract result

The frozen path returns:

```json
{
  "suggestionId": "suggestion-opaque",
  "scope": "personal",
  "approved": true,
  "sendState": "not_sent",
  "providerState": "unavailable"
}
```

No external AI provider was added. Approval is limited to Admin/Operator roles
in the requested scope; Viewer and cross-scope attempts return generic 403.
The AI module has no dispatch/send interface, and the authenticated integration
test reaches the real app route without creating a schedule or messaging call.

## Adversarial classes covered

- Malformed suggestion ID, scope query, and approval body: direct HTTP seam
  returns generic `400 {"error":"invalid request"}` without Zod details.
- Missing/invalid CSRF or foreign Origin: direct HTTP seam returns generic 403
  before the approval service is called.
- Viewer approval and Operator approval in a denied scope: both return generic
  403; no approval result is produced.
- Personal/Business scope confusion: role lookup is performed against the
  requested scope; no cross-scope role is reused.
- Provider absence: explicit `providerState: unavailable`; no fabricated
  provider success and no provider payload/content exposure.
- Configured provider state: explicit `providerState: configured` still returns
  `sendState: not_sent`.
- No-send proof: narrow approval-service and dispatch spies remain at zero calls
  for rejected requests, and the successful result remains `not_sent`; no
  messaging or scheduler interface was added to the AI seam.
- Notification disabled channels: existing HTTP integration observed zero SMTP
  and Telegram provider calls.
- Notification secret handling: settings are encrypted at rest and response
  projections contain masks, not SMTP passwords, bot tokens, or provider
  payloads.
- Notification history: failure details are stable redacted classifications,
  not provider response text.
- Retention cancellation: `confirmed: false` returns 409 and deletes zero
  rows; the previewed row remains present.
- Retention confirmation: scope, category, cutoff, preview count, and one-time
  preview token are bound before deletion; exactly one previewed row was
  deleted.
- Retention denied mutation: Business-only Operator received 403 for Personal
  read and preview with no cutoff/count disclosure.

## Verification

Commands used the pinned `npx --yes pnpm@10.12.4` launcher. Secrets and the
disposable database password are intentionally omitted from this record.

- Isolated PostgreSQL 17.6 migration: PASS.
- `npx --yes pnpm@10.12.4 exec vitest run
  tests/task-14-ai-approval-http.test.ts`: **10 passed**.
- `npx --yes pnpm@10.12.4 exec vitest run
  tests/task-14-ai-approval-http.test.ts
  tests/task-14-ai-approval-contract.integration.test.ts
  tests/task-14-retention-http.integration.test.ts
  tests/task-11-notifications.test.ts
  tests/task-11-notifications-http.integration.test.ts`: **17 passed, 4
  skipped across 5 files**; PostgreSQL-gated integration tests skipped because
  their task-specific database URLs were not set.
- `npx --yes pnpm@10.12.4 exec biome check apps/api/src/ai/http.ts
  tests/task-14-ai-approval-http.test.ts tests/task-14-ai-approval-contract.integration.test.ts
  .omo/evidence/task-14-notification-ai.md`: PASS after the formatting fix.
- `npx --yes pnpm@10.12.4 lint`: BLOCKED by the unrelated pre-existing
  formatting/import-order issue in `tests/task-13-analytics-db-fixture.ts`;
  that file was not changed.
- `npx --yes pnpm@10.12.4 typecheck`: PASS.
- `npx --yes pnpm@10.12.4 build`: PASS for config, domain, WAHA contracts, API,
  and web production builds.
- `git diff --check`: PASS.
- Pure LOC review: PASS; `apps/api/src/ai/http.ts` 42 and
  `tests/task-14-ai-approval-http.test.ts` 139 pure lines.
- Pure LOC review: all touched TypeScript files below 250 lines; largest touched
  existing file is `apps/api/src/app.ts` at 199 pure lines.
- LSP diagnostics: unavailable in the exposed toolset; TypeScript and Biome
  were used as diagnostics-equivalent gates.
- Team-mode security research: unavailable because `team_*` tools are not
  exposed in this session; no PASS claim is made for that lane.

## Manual QA and cleanup receipt

- Manual HTTP QA used Fastify `app.inject` with authenticated fixture
  principals, CSRF, Origin, malformed inputs, provider states, and route
  responses. No external provider or dispatch adapter was invoked.
- No PostgreSQL container was required for this direct provider-agnostic seam;
  PostgreSQL-gated tests were explicitly skipped without their isolated URL.
- No Compose file, protected plan, ledger, Boulder record, or state file was
  changed by this task.
- No commit, push, reset, clean, external provider, WAHA dispatch, schedule,
  media, campaign, broadcast, or autonomous worker was added.
- Cleanup completed: removed the disposable `task14-wave2-postgres` container
  after final verification; no task-owned process remains.

## Risks and limitations

- The AI approval seam is intentionally non-persistent and provider-unavailable
  by default; it is a safe contract seam, not an AI generation implementation.
- Existing notification/retention routes remain Admin-only according to their
  current contracts; no UI behavior was changed.
- The repository’s broader full-suite and external security scanners remain
  separate from this focused evidence and are not claimed here.
