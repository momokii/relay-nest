# G2 contact groups

## Implemented

- Added scoped `contact_groups` and `contact_group_members` Drizzle tables.
- Group members may reference an existing scoped contact or store only an
  AES-256-GCM encrypted phone envelope plus blind index; plaintext phone values
  are never persisted.
- Added `ContactGroupRepository` with creator grant checks, scope predicates,
  encrypted member decoding only after authorization, duplicate protection, and
  scoped add/list/remove operations.
- Wired the repository through `createRepositories` and passed the configured
  encryption key from the API app.
- Added migration `apps/api/drizzle/0010_contact_groups.sql` and focused tests.

## Verification

- `npx --yes pnpm@10.12.4 exec biome check apps/api/src/db/schema/contact-groups.ts apps/api/src/db/repositories/contact-groups.ts apps/api/src/db/repositories.ts apps/api/src/contact-groups-types.ts apps/api/src/contact-groups.test.ts apps/api/src/app.ts` — passed.
- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/contact-groups.test.ts` — blocked by the configured fallback PostgreSQL URL (`password authentication failed for user "kelanach"`); no disposable database credentials were available.
- `npx --yes pnpm@10.12.4 typecheck` — pre-existing failures remain in `app-session-service.ts`, `waha/sessions.ts`, and `waha/webhook-http.ts` for `noPropertyAccessFromIndexSignature`; the new source introduced no remaining diagnostics.
- `git diff --check` — passed.

## Manual QA

Not run: no contact-group HTTP routes are in scope for G2, and the configured
database was unavailable. `/tmp/qa-g2.json` was therefore not created.

## Review notes

- The SQL `statement-breakpoint` lines in the migration are required Drizzle
  migration directives, not explanatory comments.
- Source files remain below the 250 pure-LOC limit.
- No commit was created.
