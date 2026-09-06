# G3 group campaign scheduling evidence

## Implementation

- Added the encrypted, scope-keyed `campaigns` table and `0011_campaigns.sql`.
- Added campaign persistence, future-time validation, session and contact-group
  grant checks, WAHA group membership checks, and a route at
  `POST /scoped/sessions/:sessionId/campaigns`.
- Campaign dispatches reuse the existing leased scheduler. Internal campaign job
  markers route to `sendText` with the verified `<group>@g.us` destination.
- HTTP responses contain campaign metadata only; message and follow-up ciphertext
  never leave the server.

## Verification

```text
npx --yes pnpm@10.12.4 exec vitest run apps/api/src/campaigns.test.ts
3 tests passed
```

Targeted Biome passed after formatting the changed TypeScript files. Workspace
typecheck still reports the repository's pre-existing `TS4111` diagnostics in
`app-session-service.ts`, `waha/sessions.ts`, and `waha/webhook-http.ts`; no G3
diagnostic remains.

## Manual QA

The redacted curl probe was issued against loopback without credentials. Its
receipt is `/tmp/qa-g3.json`; no real group, message, session, or credential was
used. A live authenticated delivery was not claimed.
