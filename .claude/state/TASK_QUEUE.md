# Task Queue

Top-level execution remains **IN PROGRESS**. Todos 1-12 are complete. Todo 12
implementation and verification are recorded in local semantic commits; final
branch synchronization is pending. The protected plan and ledger are the approved
scope/history; this queue is the live operational view.

## Completed implementation

Todos 1-12 are DONE. Todo 12 is **IMPLEMENTED, VERIFIED, AND COMMITTED LOCALLY**:
retention policies, scoped preview/confirmation purge,
immutable content-free audit accountability, encrypted backup/restore,
key-rotation guidance, independent two-worker claim coverage, and auth HTTP
fixture coverage for authorized WAHA reads versus genuine unavailability. Its
source, tests, evidence, and documentation are recorded in local commits.

Final acceptance follow-up is complete: the intermittent messaging integration
failure was reproduced and fixed as a shared-fixture isolation issue, not a
product encryption issue. The messaging fixture now uses an explicit
`2000-01-01` synthetic clock; opaque repository and retention jobs are cancelled
after their assertions. Three fresh PostgreSQL 17.6 standard runs passed (`31
files, 120 passed` each), along with the focused, concurrency, auth, migration,
manual API, build, security, Compose, capability, and local documentation checks.

## Todo 12 backup hardening follow-up

Outer format/version/scope/key metadata and malformed authentication-tag
tampering are covered by focused unit tests. The authenticated metadata contract
uses outer format version `2`; old version-1 envelopes fail closed because they
cannot authenticate all metadata.

The remaining Todo 12 backup security blockers are now implemented and focused-
verified. Relational references fail closed before restore writes, transfer
limits are explicit, restore uses bounded chunks, and session messaging safety
is included in the allowlisted backup tables.

The export follow-up is also implemented and verified: all descriptor/page queries
share a repeatable-read, read-only PostgreSQL snapshot; metadata byte selection
accounts for JSON array delimiters before payload fetch; and oversized first rows
fail before payload JSON transfer. Focused backup/retention verification passed
19/19, with two additional backup integration repetitions at 7/7 each. The
final page-termination correction is committed as `1e32da0`; post-fix focused
verification passed `7 files, 38 tests`, and the fresh full suite passed `32
files, 136 tests`.

## Remaining queue

| Item | Status | Dependency |
|---|---|---|
| Todo 13 analytics projections | TODO | Todos 8-12 |
| Todo 14 dashboard and human-approved AI seam | TODO | Todos 5, 7, 9-13 |
| Todo 15 Compose deployment and operations | TODO | Todos 1, 3, 6, 7 |
| Todo 16 release verification | TODO | Todos 11-15 |
| F1 plan compliance | TODO | Todo 16 |
| F2 security and quality | TODO | Todo 16 |
| F3 executable end-to-end QA | TODO | Todo 16 |
| F4 scope/documentation review | TODO | Todo 16 |

## Session follow-up

WAHA runtime connection create/update audit events are implemented and focused-
verified. No application wiring task was added because `createApiApp` does not
compose the runtime-settings service; future route composition must pass the
central audit callback and actor identity through the existing typed seam.

## Required closeout

Do not claim the plan complete until all 16 Todos and F1-F4 have evidence.
Required checks include lint, typecheck, full tests, E2E, high-severity audit,
both Compose configurations, secret/docs/scope checks where available, and
explicit review of no unresolved security blockers. Push only after independent
verification and a clean-tree/remote check.
