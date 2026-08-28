# F2 Security and Quality Audit

Date: 2026-08-28  
Repository: RelayNest  
Branch: `main`  
Audit mode: read-only inspection and safe command execution

## Verdict

**BLOCKED.** The repository-local security controls and most quality gates pass,
but full lint is non-zero, the exact bundled WAHA image is unavailable, and
external/team security tooling was unavailable. This is not a claim of full
release security, real-provider security, bundled runtime health, or recipient
delivery.

## Scope and worktree

The audit covered the current worktree and current uncommitted diff. The diff
contains documentation/evidence/state corrections and the pre-existing deletion
of `.omo/boulder.json`; no source, test, plan, or ledger file was edited by this
audit. The deletion was not restored.

Current changed paths observed (values and sensitive paths redacted where
applicable):

```text
.claude/state/CURRENT_STATUS.md
.claude/state/TASK_QUEUE.md
.omo/boulder.json (deleted; pre-existing)
.omo/evidence/task-10-waha-command-center.md
.omo/evidence/task-12-waha-command-center.md
.omo/evidence/task-6-waha-command-center.md
.omo/evidence/task-8-waha-command-center.md
.omo/evidence/task-9-waha-command-center.md
README.md
docs/waha-capability-matrix.md
.omo/evidence/final-scope-docs.md (untracked; pre-existing)
.omo/evidence/task-16-next-phases-release.md (untracked before this report)
```

`git diff --check` exited `0` with no output. No commit or push was performed.

## Required quality gates

Commands were run with `npx --yes pnpm@10.12.4` as required.

| Command | Result | Exact observed result |
|---|---|---|
| `npx --yes pnpm@10.12.4 lint` | **BLOCKED** | Exit `1`; Biome checked 414 files and reported `Found 6 errors`. Diagnostics included the known analytics fixture import-order/format diagnostics in `tests/task-13-analytics-db-fixture.ts` and workstation traversal/format diagnostics under system paths. No fixes were applied. |
| `npx --yes pnpm@10.12.4 typecheck` | **PASS** | Exit `0`; `tsc -b --pretty false`. |
| `npx --yes pnpm@10.12.4 audit --audit-level=high` | **PASS** | Exit `0`; `No known vulnerabilities found`. |
| `npx --yes pnpm@10.12.4 secret-scan` | **PASS** | Exit `0`; repository-local secret check completed with no finding. |

Additional repository-local checks:

```text
npx --yes pnpm@10.12.4 verify:requirements
npx --yes pnpm@10.12.4 verify:scope
npx --yes pnpm@10.12.4 docs:check
  all exited 0

npx --yes pnpm@10.12.4 exec biome check scripts package.json biome.json tests/release-*.test.ts tests/release-checks-test-support.ts
  exit 0; checked 33 files; no fixes

git diff --check
  exit 0; no output
```

The historical Todo 10 release matrix additionally records a complete isolated
PostgreSQL run of `67 files, 321 tests` with `0 failed, 0 skipped`, focused and
full relevant Playwright at `20/20`, and a bounded release suite at `101/101`.
Those results used disposable PostgreSQL and deterministic/mock WAHA; they are
not real-provider or recipient-delivery evidence.

## Security inspection

### Authentication and authorization — inspected, no new exploit proven

- Authentication hashes session tokens at rest, checks revocation, active-user
  state, and expiry; login failures use a PostgreSQL-backed bounded rate limit.
- Authorization is server-side and combines role, explicit session grant, target
  session scope, requested account scope, active-session state, and action type.
  Viewer command actions are denied.
- Boundary schemas validate scope, UUIDs, lifecycle actions, credentials, and
  request bodies. Mutating session/schedule paths require same-origin and CSRF
  checks.
- No browser-visible WAHA API key or unrestricted WAHA endpoint launcher was
  observed in the inspected paths.

### Encryption and key handling — inspected, no new exploit proven

- Application encryption uses AES-256-GCM with a 32-byte master key, validated
  nonce/authentication-tag sizes, and authenticated account-scope metadata.
- Backup format version, scope, key metadata, and inner authenticated metadata
  must match; wrong, missing, malformed, or tampered keys fail closed.
- Compose key input is file-based; simultaneous direct/file key sources fail
  closed. Key material is not reproduced in this report.

### Error redaction and data handling — inspected, no new exploit proven

- WAHA adapter errors expose classifications/statuses and bounded paths rather
  than provider response bodies or API keys; service routes return generic WAHA
  unavailability/unsupported-capability errors.
- Backup and restore errors are generic authentication/format failures and do
  not return decrypted payloads.
- Repository-local `secret-scan` passed. No secrets, passwords, tokens, message
  text, private URLs, raw logs, or database URLs are included here.

### Dependencies and lockfile — pass with residual review boundary

- `pnpm-lock.yaml` is present with pinned importer versions and an `esbuild`
  override at `0.25.12`.
- High-severity pnpm audit exited `0` with no known vulnerabilities.
- `gitleaks`, `semgrep`, and `osv-scanner` were **UNAVAILABLE**; no external
  scanner result is claimed.

### Compose users, ports, and secrets — configuration pass; runtime blocked

With non-secret placeholder paths supplied only for configuration interpolation:

```text
ENCRYPTION_MASTER_KEY_FILE=/run/secrets/example-key
POSTGRES_PASSWORD_FILE=/run/secrets/example-password
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config --quiet
  external_config_exit=0
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha config --quiet
  bundled_config_exit=0
```

Inspection found PostgreSQL and application secret-file references, non-root
application image conventions documented by the existing evidence, API and
bundled WAHA internal `3000` exposure, and web-only host publication. The first
unsubstituted configuration attempt failed honestly with:
`required variable ENCRYPTION_MASTER_KEY_FILE is missing a value`.

The exact bundled blocker was reproduced with:

```text
docker manifest inspect devlikeapro/waha:2026.8.1
  exit 1; no such manifest: docker.io/devlikeapro/waha:2026.8.1
```

The bundled Compose service is deliberately fail-closed and exits before a WAHA
process starts. No bundled startup, health, UID, linking, account-safety, or
delivery result is claimed. The supported runtime secret boundary also remains
unverified; no undocumented WAHA `_FILE` convention is assumed.

## Findings and blockers

| ID | Severity | Finding | Evidence | Required action |
|---|---|---|---|---|
| F2-01 | **BLOCKER** | Full lint is not green. | Required lint exited `1`; six diagnostics were reported, including the analytics fixture and workstation traversal diagnostics. | Resolve or explicitly scope the diagnostics, then rerun the exact full lint command. Do not report full lint as passed meanwhile. |
| F2-02 | **BLOCKER** | Bundled WAHA cannot be runtime-verified. | `docker manifest inspect devlikeapro/waha:2026.8.1` exited `1` with no manifest. | Make the exact image available and verify the supported secret boundary, startup, health, non-root UID, and failure behavior. Do not substitute another image/tag. |
| F2-03 | **LIMITATION** | External security scanners and Team Mode security research were unavailable. | `gitleaks`, `markdown-link-check`, `lychee`, `semgrep`, and `osv-scanner` were unavailable; the configured security-review Team Mode was unavailable. | Install/enable the approved tools and rerun them; retain `UNAVAILABLE` until then. |
| F2-04 | **LIMITATION** | Real provider and several browser/runtime paths remain unverified. | Existing release evidence used mock WAHA and disposable PostgreSQL; browser worker restart, browser double-submit, browser backup/restore, real AI approval, native WAHA dashboard parity, real linking, and recipient delivery were not proven. | Execute isolated, approved runtime/E2E coverage before a release PASS. |

No exploitable authentication, scope-isolation, encryption, key-handling, error-
redaction, dependency, or Compose exposure defect was proven by this read-only
inspection. This statement is bounded by the unavailable scanners and runtime
coverage above, and is not a security certification.

## Historical evidence redaction correction

The current diff includes a correction pass for historical evidence artifacts.
Previously retained disposable database credentials, database URL material, and
an HMAC/API-key example were replaced with redacted placeholders or omitted
values in the Todo 6, 8, 9, 10, and 12 evidence files. The correction preserves
commands, statuses, counts, and exit results without reproducing sensitive
values. The repository-local secret scan passed after the correction.

## Remediation and next actions

1. Keep the verdict **BLOCKED**; do not mark F2, Todo 16, or F1-F4 complete.
2. Resolve the six full-lint diagnostics and rerun full lint without a fixer
   silently changing unrelated files.
3. Obtain and verify the exact `devlikeapro/waha:2026.8.1` image plus a
   supported runtime secret boundary; otherwise retain the bundled blocker.
4. Run the unavailable external scanners and an enabled, independent security
   review, recording unavailable tools honestly if they remain unavailable.
5. Run isolated approved runtime/E2E checks for the unverified browser, real
   provider, linking, recovery, and delivery boundaries.
6. Preserve redaction, the pre-existing `.omo/boulder.json` deletion, and the
   existing protected plan/ledger without silent restoration or rewriting.
