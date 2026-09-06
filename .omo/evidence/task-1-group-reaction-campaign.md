# G1 WAHA group client evidence

## Implementation

- Added `apps/api/src/waha/groups.ts` with typed create, list, add-participant,
  and remove-participant operations.
- Added Zod contracts for group responses and mutation inputs in
  `packages/waha-contracts/src/index.ts`.
- Wired the operations through the server-only `session-adapter.ts` and
  `WahaSessionClient`; no browser module receives the WAHA API key.
- Group mutations use the WAHA API key's `send` scope. WAHA HTTP 403 responses
  remain typed `WahaHttpError` authorization failures.
- The deprecated `POST /api/reaction` endpoint was not added. Reaction support
  will use the canonical `PUT /api/reaction` in the later reaction task if
  needed.

## Verification

Command: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/waha/groups.test.ts`

Result: 3 tests passed, covering create/list/add/remove request paths,
malformed names, and missing `send` scope (403).

Command: `npx --yes pnpm@10.12.4 exec biome check apps/api/src/waha/groups.ts apps/api/src/waha/groups.test.ts apps/api/src/waha/session-adapter.ts apps/api/src/waha/session-types.ts packages/waha-contracts/src/index.ts`

Result: passed.

Command: `npx --yes pnpm@10.12.4 typecheck`

Result: blocked by unrelated existing/concurrent errors in `app-session-service.ts`,
`sessions.ts`, `webhook-http.ts`, and contact-groups files. No error references
G1 files after the fix.

## Manual QA

The healthy `relaynest-dev-waha-1` container was queried directly with its
server-side secret and the result was captured at `/tmp/qa-g1.json`.
The configured `personal` session is absent, so WAHA returned:

```json
{"error":"Session \"personal\" does not exist","session":"personal"}
```

No group was created. Engine caveat: group operations are documented across
the supported engines, while NOWEB group behavior depends on its Store/session
state and must be verified against the selected runtime before production use.
