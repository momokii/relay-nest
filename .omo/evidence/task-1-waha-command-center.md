# Todo 1 verification evidence

Date: 2026-08-16 UTC

## Baseline before changes

- Command: `pnpm docs:check`
- Result: unavailable because the unchanged repository has no `package.json`; shell output was `NO_PACKAGE_JSON`.
- Baseline worktree observation: the workspace is not a Git repository (`git status` reports `fatal: not a git repository`), and the pre-change top level contained only `.claude/`, `.omo/`, `.codegraph`, `.env.example`, and `.gitignore`.

## Focused validator

- Equivalent deterministic command: `python3 scripts/check_waha_capability_matrix.py docs/waha-capability-matrix.md`
- Complete matrix: exit `0`; `WAHA capability matrix OK: docs/waha-capability-matrix.md (16 mandatory capabilities)`.
- Syntax check: `python3 -m py_compile scripts/check_waha_capability_matrix.py`; exit `0`.
- `pnpm docs:check` remains unavailable because no workspace/package manifest exists.

## Exact capability endpoint contracts

- `scripts/check_waha_capability_matrix.py` now contains a required ID-to-method/path mapping for all 16 mandatory capability IDs.
- Each matrix row's complete `Method/Path` cell must equal its mapped contract; this prevents an endpoint mutation from passing while its capability ID remains unchanged.
- The `environment` contract is explicitly pinned to `GET /api/server/environment`.

## Exact contract failure probes

Each probe used a temporary copy under `/tmp/waha-capability-probes.*`; all intentional failures returned nonzero:

| Probe | Result |
|---|---|
| Mutate `environment` from `GET /api/server/environment` to `GET /api/server/status` | exit `1`; `environment: method/path must be exactly 'GET /api/server/environment'` |
| Remove the `environment` row | exit `1`; `missing mandatory capability row: environment` |
| Change pinned OpenAPI version `2026.8.1` to `2026.8.0` | exit `1`; `OpenAPI version drift: expected 2026.8.1, found 2026.8.0` |
| Change pinned SHA-256 | exit `1`; `OpenAPI SHA-256 drift` |

## Pin verification

- Command: `curl -fsSL --retry 2 --max-time 30 https://waha.devlike.pro/swagger/openapi.json -o "$tmp" && sha256sum "$tmp" && python3 -c '...info.version...'`
- Result: PASS; `info.version=2026.8.1`, SHA-256 `58cb7725d8e687fd98baa6767118963c27335a8d35f1920b1d9a503c255854cb`.
- Exact pinned contract: OpenAPI `3.1.0`, `info.version` `2026.8.1`, and the SHA-256 above.
- Docker result: Docker `29.3.1` is installed, but no WAHA container was started. The matrix does not claim image-runtime behavior or an immutable image digest; runtime verification remains an implementation follow-up.

## Command Center boundary contract

- Complete boundary table: validator exit `0`.
- Boundary failure probe: remove the `analytics` row from a temporary copy; exit `1`, `missing Command Center-owned boundary row: analytics`.
- Pin failure probe: alter the recorded SHA-256 in a temporary copy; exit `1`, `missing exact OpenAPI contract pin`.
- Version failure probe: alter the recorded OpenAPI version in a temporary copy; exit `1`, `OpenAPI version drift`.

## Failure probes

Each probe used a temporary copy outside the repository. All intentional failures returned nonzero:

| Adversarial class | Mutation | Result |
|---|---|---|
| `malformed_input` | Blank the `health` row method/path cell | exit `1`; reports missing mandatory field and invalid method/path |
| `stale_state` | Change pinned retrieval date from `2026-08-16` to `2026-08-15` | exit `1`; reports OpenAPI retrieval date drift |
| `misleading_success_output` | Remove mandatory `media` parity row | exit `1`; reports missing mandatory capability row: `media` |
| `dirty_worktree` | Leave unrelated repository files untouched | pass; no unrelated file was edited |
| `boundary_omission` | Remove the mandatory `analytics` ownership row | exit `1`; reports the missing Command Center-owned boundary |
| `pin_drift` | Change the exact pinned OpenAPI SHA-256 | exit `1`; reports missing exact contract pin |
| `version_drift` | Change the pinned OpenAPI version | exit `1`; reports OpenAPI version drift |

Not applicable in this task: `prompt_injection` (no untrusted instruction source was processed), `cancel_resume` (no cancellation or resume occurred), `generated_artifact` (the matrix and checker are intentional source deliverables), `flaky_test` (validator is deterministic and network-free), and `repeated_interruptions` (no repeated interruption occurred).

## Cleanup receipt

- Temporary copies were created under `/tmp` and removed by an exit trap after every probe.
- No temporary copy remains in the repository or `/tmp` test directory.
- No product code, `.omo` plan state, or unrelated file was edited.
