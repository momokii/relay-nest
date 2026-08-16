# Todo 4 evidence: PostgreSQL persistence and encryption

## Baseline before this corrective pass

- `npx --yes pnpm@10.12.4 lint` — PASS
- `npx --yes pnpm@10.12.4 typecheck` — PASS
- `npx --yes pnpm@10.12.4 test -- --runInBand` — PASS (3 files, 8 tests)

## Red phase

Added failing-first real seams for PostgreSQL repositories and raw migration
replay. The initial focused run failed because the client/repository modules were
absent; the corrected implementation follows in this pass.

## Verification log

- Focused red run: `npx --yes pnpm@10.12.4 exec vitest run tests/encryption.test.ts tests/repositories.test.ts` — expected FAIL; both suites reported only missing planned modules.
- `npx --yes pnpm@10.12.4 exec vitest run tests/migration-replay.test.ts tests/repositories.integration.test.ts` without `DATABASE_URL` — PASS with 4 integration tests skipped by design.
- `DATABASE_URL=<disposable-db> npx --yes pnpm@10.12.4 exec vitest run tests/migration-replay.test.ts` — PASS (raw file executed twice directly, 1 test).
- `DATABASE_URL=<same-disposable-db> npx --yes pnpm@10.12.4 exec vitest run tests/repositories.integration.test.ts` — PASS (5 tests: retention scope, duplicate uniqueness, audit append-only/scope, user roles, session grants, and scoped WAHA connection reads/uniqueness).
- `npx --yes pnpm@10.12.4 lint` — PASS (40 files).
- `npx --yes pnpm@10.12.4 typecheck` — PASS.
- `npx --yes pnpm@10.12.4 test -- --runInBand` — PASS (2 files, 5 tests; 4 DB tests skipped without `DATABASE_URL`).
- `npx --yes pnpm@10.12.4 build` — PASS (all 5 build projects).
- `npx --yes pnpm@10.12.4 audit --audit-level high` — PASS; no known vulnerabilities.
- `npx --yes pnpm@10.12.4 --filter @waha-command-center/api db:generate` — PASS; no schema drift after migration generation.
- Final post-fix build — PASS, then generated outputs were removed again.
- Final post-split live run — raw replay PASS (1/1), repository integration PASS (5/5), audit delete PASS closed, fixed-UUID scope PASS closed.

## Disposable PostgreSQL manual QA

Used a temporary `postgres:17.6-alpine` container on host port `55432`; the
command trapped cleanup and removed the container on exit.

- Fresh `db:migrate` — PASS.
- Repeat `db:migrate` — PASS; only expected existing-schema notices.
- Required table probe — PASS (12 tables).
- Ciphertext storage probe — PASS (9 `%ciphertext` columns; the selected value
  was an opaque fixture marker, not a secret).
- Cross-scope Personal session → Business contact insert — PASS closed; typed
  SQL error `account scope does not match session`.
- Audit update probe — PASS closed; SQL error `audit entries are immutable`.
- Direct audit delete probe — PASS closed; SQL error `audit entries are immutable`.
- Fixed-UUID cross-scope probe — PASS closed; SQL error `account scope does not match session`.
- User-role repository — PASS; Personal/Business reads are filtered by account scope and duplicate role assignment maps to `DuplicateRecordError`.
- Session-grant repository — PASS; matching session/account scope is required, wrong-scope reads return null, duplicates map to `DuplicateRecordError`.
- WAHA-connection repository — PASS; global connection uniqueness maps to `DuplicateRecordError`, and `findForSession` only exposes the connection through a matching account-scoped session.
- Encryption unit probes — PASS for round trip, ciphertext tampering, metadata
  mismatch, malformed nonce, wrong key, missing key, and stable blind index.

## Adversarial results

- `malformed_input`: rejected by Zod envelope parsing and fixed-size nonce/tag/key checks.
- `prompt_injection`: no prompt or message interpretation exists in persistence; values are opaque data.
- `stale_state`: migration-ledger repeat and direct raw-file replay both completed successfully.
- `dirty_worktree`: existing docs and evidence were preserved; no plan state or ledger was edited.
- `generated_artifact`: final workspace `dist/` and package `tsconfig.tsbuildinfo` outputs were removed after verification; nested ignore rules now cover both; no coverage or test-results directories were created.
- `cleanup_shell`: an empty zsh glob initially returned nonzero after successful verification; rerun with `setopt nonomatch` completed cleanup and left no matching temp files or containers.
- `long_command`: migrations are one bounded Drizzle migration and completed within the command timeout.
- `misleading_success_output`: probes asserted table count, ciphertext columns, and failed mutations rather than relying on success logs.
- `scope_confusion`: role, grant, connection/session join, and fixed-UUID database trigger probes all used explicit Personal/Business assertions.
- `repeated_interruptions`: not triggered; no cancellation/resume behavior was exercised.

## Changed implementation areas

- `packages/config/src/encryption.ts` — AES-256-GCM envelope cipher, authenticated scope metadata, typed failures, keyed blind indexes.
- `packages/config/src/index.ts` — validated database URL and optional infrastructure master-key input.
- `apps/api/src/db/schema/*` — typed Drizzle tables/enums for users, roles/grants, WAHA connections, sessions, contacts, jobs, attempts, events, audit, notifications, and retention.
- `apps/api/src/db/client.ts`, `apps/api/src/db/repositories.ts`, `apps/api/src/db/repository-support.ts`, `apps/api/src/db/repositories/identity.ts`, `apps/api/src/db/repositories/transport.ts` — typed PostgreSQL/Drizzle client and repositories for users, roles, grants, WAHA connections, sessions, contacts, jobs, attempts, events, audit, notifications, and retention; no in-memory persistence.
- `apps/api/drizzle/0000_tranquil_magik.sql` plus Drizzle metadata — migration, encrypted-field shape checks, scope guards, and immutable audit trigger.
- `apps/api/package.json`, `pnpm-lock.yaml`, `.claude/state/DECISIONS_LOG.md` — pinned `postgres@3.4.7` driver required for Drizzle migration execution.
- `tests/encryption.test.ts`, `tests/repositories.integration.test.ts`, `tests/migration-replay.test.ts` — focused red→green encryption, real repository, and direct migration tests.

No plaintext secrets, message content, or contact content are recorded in this file.
