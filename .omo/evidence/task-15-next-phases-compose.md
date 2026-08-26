# Todo 15 Compose Runtime Hardening — 2026-08-25

## Scope and safety

- Slice: Todo 15 / next-phases slice 6 only: Compose runtime boundaries, health,
  secrets, migrations, and immutable image references.
- The ongoing worktree already contained related Compose/Docker hardening edits.
  This slice adds the missing API health-start grace period, persistent bundled
  WAHA session storage, mutually exclusive encryption-key template examples, and
  their failing-first regressions, without rewriting protected plan, ledger,
  Boulder, or `.claude/state` files.
- All secret material was generated only in a mode-600 directory under
  `/tmp/opencode/`, never printed, captured, resolved, or retained. The directory
  was removed during cleanup.
- External-mode QA used `http://127.0.0.1:9` as an intentionally unavailable
  provider endpoint. No WAHA account, credential, or existing WAHA container was
  contacted.

## Baseline and red-green regression

1. Before this slice's production edit,
   `npx --yes pnpm@10.12.4 exec vitest run tests/compose-startup.test.ts tests/compose-external-proxy.test.ts`
   passed: 2 files, 8 tests.
2. Unprovisioned `docker compose -f docker-compose.yml config --quiet` failed
   closed because `ENCRYPTION_MASTER_KEY_FILE` is required. No secret value was
   emitted.
3. Added the test `allows the API migration-before-listen startup window before
   health failures count` to `tests/compose-startup.test.ts` before editing the
   Compose file. It failed for the expected reason: the API service lacked
   `start_period: 30s`.
4. Added only `start_period: 30s` to the API healthcheck in
   `docker-compose.yml`. This permits the bounded migration-before-listen startup
   interval without weakening the existing health endpoint, timeout, retry count,
   database health dependency, or private API boundary.

## Configuration and regression results

- With generated placeholder secret files, all commands exited 0 without writing
  resolved Compose configuration:
  - base: `docker compose -f docker-compose.yml config --quiet`
  - external: `docker compose -f docker-compose.yml -f docker-compose.external-waha.yml config --quiet`
  - bundled: `docker compose -f docker-compose.yml -f docker-compose.bundled-waha.yml --profile waha config --quiet`
- Both placeholder secret files were mode `600`.
- **Pre-correction historical result:** isolated interpolation with
  `--env-file /tmp/opencode/.../empty.env` confirmed external mode without
  `WAHA_BASE_URL` exited 1 and the earlier bundled overlay without
  `WAHA_API_KEY` exited 1. The current correction no longer requires or
  interpolates a bundled WAHA credential; current redaction results are recorded
  below.
- `npx --yes pnpm@10.12.4 exec vitest run tests/compose-startup.test.ts tests/compose-external-proxy.test.ts`:
  passed, 2 files / 9 tests.
- `npx --yes pnpm@10.12.4 exec biome check tests/compose-startup.test.ts tests/compose-external-proxy.test.ts`:
  passed, 2 files checked.
- `npx --yes pnpm@10.12.4 typecheck`: passed.
- `npx --yes pnpm@10.12.4 build`: passed (config, domain, WAHA contracts, API,
  and web builds).
- `GIT_MASTER=1 git diff --check`: passed.

## Disposable external runtime QA

- Project: `relaynest-task15-slice6`; only `WEB_PORT=38156` was published.
- Startup command (with generated placeholder paths omitted here) used base plus
  external Compose files, `up --build --wait --wait-timeout 180 -d`, and passed.
  PostgreSQL became healthy before API; API became healthy before web; all three
  services were healthy.
- `GET http://127.0.0.1:38156/` returned 200.
- Same-origin `GET http://127.0.0.1:38156/health` returned 200 through the web
  proxy. No direct API host endpoint was used.
- Docker port metadata reported API `3000/tcp` as `null` (not host-published) and
  web `4173/tcp` only on host port 38156. `api` and `web` both ran as UID 1000.
- `docker compose port api 3000` was not used as boundary proof because it printed
  `invalid IP:0` while returning exit 0; Docker inspect port metadata is the
  authoritative result.

## Bundled runtime status

- **Pre-correction historical result:** bundled configuration validation passed
  with a placeholder `WAHA_API_KEY`; that credential-bearing overlay was later
  removed. The current bundled configuration has no WAHA credential and remains
  internal through `expose: "3000"` with no host `ports` mapping.
- `docker manifest inspect devlikeapro/waha:2026.8.1` failed with
  `no such manifest: docker.io/devlikeapro/waha:2026.8.1`.
- No replacement tag or digest was guessed, no bundled runtime was started, and
  bundled runtime health is **BLOCKED**, not passed.

## Adversarial classes and cleanup

| Class | Result |
| --- | --- |
| Malformed config/input | Missing encryption secret and external URL fail closed; bundled mode is credential-free and exits 78 before WAHA starts. |
| Stale state | Existing local `.env` initially masked the missing external URL; an empty explicit env file isolated interpolation and produced the expected exit 1. |
| Dirty worktree | Ongoing uncommitted Compose/Docker/test changes were inspected and preserved; this slice adds API health grace, bundled session persistence, exclusive encryption template semantics, their regressions, and this evidence. |
| Long commands | Compose build/start used bounded `--wait-timeout 180`; startup completed with all external-mode services healthy. |
| Flaky tests | Focused static Compose tests are deterministic and passed after the red-green transition. |
| Misleading success output | `docker compose port` exit 0 was rejected as proof; inspected Docker port metadata instead. |
| Repeated interruptions | Validation was rerun with explicit temporary secrets and isolated env interpolation before the final claim. |
| Generated artifacts | Task-owned containers, network, volume, and temporary secret directory were removed. |

Cleanup command used the unique project only: `down --volumes --remove-orphans`.
Post-cleanup result: task-owned containers=0, volumes=0, networks=0, and the
temporary secret directory was removed. Existing projects and resources were not
targeted.

## DoneClaim

- Changed files: `docker-compose.yml`, `.env.example`,
  `tests/compose-startup.test.ts`, and this evidence file; the current worktree
  also contains other ongoing Docker/Compose hardening changes observed at slice
  start.
- Manual QA: external mode is healthy, same-origin proxy health is 200, API is
  private, and app runtime UIDs are non-root.
- Risks: the exact bundled WAHA manifest remains unavailable; bundled runtime
  startup/health cannot be claimed.
- Status: this Todo 15 slice is **complete for verified external-mode hardening**;
  Todo 15 as a whole remains **blocked** on the bundled WAHA manifest and later
  operations/documentation slices.

## Post-review bundled security correction — 2026-08-26

Authoritative source research confirmed that the exact WAHA source supports
`WAHA_API_KEY` and `sha512:<hash>` values, but not Docker secret files or an
`*_FILE` variable. Both plaintext and hash verifier values are credentials for
RelayNest's resolved-config/inspection boundary. The bundled overlay therefore
no longer interpolates a WAHA credential or an unverified health-exclusion
variable. The base `waha` service exits with status 78 before starting WAHA,
which keeps the unavailable bundled path fail-closed. No bundled runtime was
started or claimed; the exact image manifest remains unavailable.
