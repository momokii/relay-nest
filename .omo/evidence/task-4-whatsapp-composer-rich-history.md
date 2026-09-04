# T4 sent-history API evidence

## Implementation

- Added `GET /scoped/sent-history?scope=&page=&pageSize=` and registered it in
  `apps/api/src/app.ts`.
- Repository queries are restricted by both `account_scope` and the caller's
  `session_grants` before encrypted fields are decrypted.
- The response contains only the scoped projection: `id`, `sessionId`, `scope`,
  `recipientPhone`, `snippet80`, `scheduledFor`, `createdAt`, `state`, and
  `providerMessageId`.
- Results are ordered by `createdAt DESC, id DESC`; page size defaults to 20
  and is capped at 50. Decryption failures redact the phone and snippet as
  `null`, while preserving the scheduled job's canonical state.

## Verification

Passed:

```text
npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts
5 tests passed

npx --yes pnpm@10.12.4 typecheck
passed

npx --yes pnpm@10.12.4 exec biome check \
  apps/api/src/app.ts apps/api/src/sent-history.ts \
  apps/api/src/sent-history.test.ts apps/api/src/db/repositories.ts \
  apps/api/src/db/repositories/sent-history.ts vitest.config.ts
passed
```

The focused tests cover Personal projection/redaction, page-size capping,
Business no-grant isolation, canonical `submitted`, and wrong-key handling.

Manual curl QA was not run because no authenticated development API/session
cookie was available in this execution environment. No temporary QA artifact
was created.
