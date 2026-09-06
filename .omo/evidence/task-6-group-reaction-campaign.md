# G6 group reaction campaign trigger

## Implementation

- Added `apps/api/src/campaigns/reaction-trigger.ts`.
- Reaction events are parsed at the webhook boundary and dispatched only after
  the normalized event is inserted successfully.
- The trigger selects sent campaigns in the same account scope/session, requires
  the reactor to be in the campaign contact group, and delegates the immediate
  send to the existing messaging service. That service applies consent,
  quiet-hours, pacing, capping, timelock, budget, burst, and duplicate-content
  safety gates.
- Immediate sends use the stable key
  `campaign:<campaignId>:reaction:<reactor>:<reactionMessageId>` and are audited.
- Campaign follow-up text is decrypted only by the scoped campaign repository.

## Verification

Passed:

```text
npx --yes pnpm@10.12.4 exec vitest run apps/api/src/campaigns/reaction-trigger.test.ts
4 tests passed

npx --yes pnpm@10.12.4 exec vitest run \
  apps/api/src/campaigns/reaction-trigger.test.ts \
  apps/api/src/webhook-reaction.test.ts
7 tests passed

npx --yes pnpm@10.12.4 exec biome check <12 changed TypeScript files>
passed
```

The focused regression covers member send, non-member suppression, duplicate
reaction idempotency, and a quiet-hours safety denial returned by the messaging
gate. Webhook coverage verifies valid reaction normalization callback invocation,
encrypted persistence, HMAC/replay rejection, and provider-event deduplication.

Workspace typecheck was run but remains blocked by five pre-existing TS4111
diagnostics in `app-session-service.ts`, `waha/sessions.ts`, and
`waha/webhook-http.ts`; none are in the G6 implementation.

LSP diagnostics were unavailable in this environment because no diagnostics
connection/tool is configured.

## Manual QA

Not claimed. A disposable authenticated PostgreSQL/API runtime was not available
in this task execution, so no valid-HMAC live webhook was submitted and
`/tmp/qa-g6.json` was not generated. No real WhatsApp account or provider send
was exercised.
