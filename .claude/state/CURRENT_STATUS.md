# Current Status

## Repository truth

- Branch: `main`, tracking `momokii/relay-nest` `origin/main`.
- Todo 12 implementation and documentation are committed locally in four
  semantic commits; the final push is pending branch verification.
- `.omo/plans/waha-command-center.md` and `.omo/start-work/ledger.jsonl` were
  updated with the verified Todo 12 completion record.

## Implementation

Todos 1-12 are implemented. Todo 12 is independently verified: scoped retention
metadata, confirmation-gated purge, immutable
content-free audit accountability, AES-256-GCM backup/restore, key-rotation
guidance, and the independent two-worker scheduler regression coverage.

Todo 12 implementation and verification are current in local history. Next is
Todo 13,
followed by Todos 14-16 and final F1 plan compliance, F2 security/quality, F3
executable QA, and F4 scope/documentation gates.

## Verification snapshot

- Fresh PostgreSQL 17.6 repository/messaging matrix: `10/10`, run twice.
- Standard `pnpm test` with `fileParallelism: false`: `31 files, 120 passed`,
  three consecutive runs against fresh isolated PostgreSQL databases.
- Focused Todo 12 suite: `10/10`, run twice; dedicated concurrency matrix:
  `10/10`, run twice; auth migration/HTTP matrix: `4/4`, run twice.
- Todo 12 evidence: `.omo/evidence/task-12-waha-command-center.md`.
- Final source-fix revalidation passed after changing the messaging integration
  clock to explicit `2000-01-01` with a fixture-isolation comment. Lint,
  typecheck, ordered workspace/API/web builds, high-severity dependency audit,
  all three Compose configs, WAHA capability test, and local Markdown-link scan
  passed.
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
Production encryption and claim behavior remain unchanged. Manual scope
purge/backup/restore/wrong-key QA remains valid because the final change is
test-only and production encryption, scheduler claims, and HTTP routes were not
modified. Runtime, container, port, temporary, and build-artifact cleanup is
complete.
Report exact results; push only after the final clean-tree, verification, and
remote checks.

Last updated: 2026-08-17
