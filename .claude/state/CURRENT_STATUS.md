# Current Status

## Repository truth

- Branch: `main`, tracking `momokii/relay-nest` `origin/main`.
- Todo 12 implementation and documentation are committed locally in nine
  semantic commits; the final push is pending branch verification.
- `.omo/plans/waha-command-center.md` and `.omo/start-work/ledger.jsonl` were
  updated with the verified Todo 12 completion record.

## Implementation

Todos 1-12 are implemented. Todo 12 is independently verified: scoped retention
metadata, confirmation-gated purge, immutable content-free audit accountability,
AES-256-GCM backup/restore, authenticated metadata, bounded relational transfer,
key-rotation guidance, WAHA configuration audit events, and the independent
two-worker scheduler regression coverage.

Todo 12 implementation and verification are current in local history. Next is
Todo 13,
followed by Todos 14-16 and final F1 plan compliance, F2 security/quality, F3
executable QA, and F4 scope/documentation gates.

## Verification snapshot

- Fresh PostgreSQL 17.6 repository/messaging matrix: `10/10`, run twice.
- Historical pre-hardening standard matrix: `31 files, 120 passed`, three
  consecutive runs against fresh isolated PostgreSQL databases.
- Current hardening matrix: `32 files, 134 passed` against fresh PostgreSQL
  17.6; focused Todo 12/WAHA matrix: `5 files, 33 passed`.
- Todo 12 evidence: `.omo/evidence/task-12-waha-command-center.md`.
- Lint, typecheck, ordered workspace/API/web builds, high-severity dependency
  audit, three Compose configurations with placeholders, Playwright smoke, and
  local Markdown-link scan passed.
- External `gitleaks`, `markdown-link-check`, `lychee`, and `docs:check` were
  unavailable; no result was claimed for those checks.

## Security and limitations

Personal/Business scope checks, Admin authorization, CSRF/same-origin, server-
side WAHA credentials, encryption, redaction, immutable audit, and fail-closed
backup validation remain mandatory. WAHA is an unofficial reverse-engineered
client and account restriction/ban risk remains inherent. Backup expiry is
separate from live purge; public-internet deployment is not the default.

## Next work

Todo 12/manual QA and the requested sequential verification matrix are complete.
The auth HTTP fixture now proves both authorized session reads and genuine WAHA
unavailability. The intermittent messaging failure was a shared-test-database
clock overlap: unrelated opaque fixture jobs were due before the messaging
test's claim. The messaging fixture now uses an explicit `2000-01-01` clock;
repository and retention fixtures now cancel opaque jobs after their assertions,
and preview now requires the same Origin/CSRF boundary as purge and backup.
Production encryption and scheduler claim behavior remain unchanged. Manual
scope purge/backup/restore/wrong-key QA remains valid; backup metadata,
relational validation, transfer bounds, and WAHA audit hardening were exercised
by focused and full suites. Runtime, container, port, temporary, and build-
artifact cleanup is complete.
Report exact results; push only after the final clean-tree, verification, and
remote checks.

## Session update: backup envelope authentication hardening

- Added focused tamper tests for outer format, version, account scope,
  keyMetadata, and malformed auth tags.
- Changed the backup outer format version to `2`; focused Vitest, TypeScript
  build-check, and changed-file Biome checks pass.
- The earlier plain Vitest failure was an environment-only fallback to the
  workstation PostgreSQL URL; the explicit isolated URL now passes the full
  suite.
- Version-1 backups are intentionally rejected because they cannot prove all
  required metadata. The hardening source and tests are committed locally;
  final remote synchronization remains pending.

Last updated: 2026-08-17

## Session update: backup relational transfer hardening

- Added test-first coverage in `tests/task-12-backup.integration.test.ts` for
  Personal/Business relational scope confusion, missing parents, atomic
  no-partial restore, `session_messaging_safety` round trips, and the fixed
  10,000-row transfer ceiling. Unknown restore table keys are covered in the
  focused unit suite.
- Replaced unbounded backup `json_agg` with explicit allowlisted descriptors and
  UUID keyset pages. Export and restore enforce fixed 10,000-row/8 MiB limits;
  restore validates relations before chunked writes in one transaction and uses
  250-row chunks. Valid idempotent replays retain conflict-tolerant semantics
  only after relational validation.
- Disposable PostgreSQL 17.6 focused verification passed: 5 files, 33/33
  tests. Full verification subsequently passed 32 files/134 tests; source,
  tests, and state are committed locally. Local `pnpm` is unavailable, so
  verification uses `npx --yes pnpm@10.12.4`.
- The no-excuse TypeScript script remains unavailable and is not claimed as
  passed.

## Session update: WAHA runtime audit events

- Added test-first create/update audit coverage in `tests/waha-adapter.test.ts`.
- Extended `createWahaRuntimeSettingsService` with optional typed audit and actor
  options in `apps/api/src/waha/config.ts`; events are content-free and use the
  persisted opaque connection ID.
- No `app.ts` wiring was needed: the application currently does not compose this
  runtime-settings service. Focused Vitest passed `14/14`; typecheck and Biome
  passed. Full Vitest passed against isolated PostgreSQL.
