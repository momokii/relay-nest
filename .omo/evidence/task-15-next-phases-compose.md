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

## Fresh independent verification — 2026-08-27

### Baseline and configuration

- Worktree was clean on `main` at `17813f3`; no Compose, Dockerfile, or test
  source changes were necessary.
- `npx --yes pnpm@10.12.4 exec vitest run tests/compose-startup.test.ts tests/compose-external-proxy.test.ts`
  passed: 2 files, 11 tests.
- `npx --yes pnpm@10.12.4 exec biome check tests/compose-startup.test.ts tests/compose-external-proxy.test.ts`
  passed: 2 files checked.
- `npx --yes pnpm@10.12.4 typecheck` passed.
- `npx --yes pnpm@10.12.4 build` passed for config, domain,
  waha-contracts, API, and web.
- Without a secret file, the exact base/external config command exits 1 with
  `required variable ENCRYPTION_MASTER_KEY is missing a value` (value omitted).
- With mode-600 placeholder secret files, these exact commands both exit 0:
  `docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config --quiet`
  and
  `docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha config --quiet`.
- Omitting `WAHA_BASE_URL` from the external command exits 1 with the redacted
  actionable error `required variable WAHA_BASE_URL is missing a value`.

### Disposable external runtime

- Unique project: `relaynest-todo6-1787842433-2335137`; secret files were
  temporary mode 600 files under `/tmp/opencode/` and contained placeholders
  only. The startup command was the exact external stack with
  `up --build --wait --wait-timeout 180 -d`.
- Compose reported `postgres`, `api`, and `web` running and healthy. The
  resolved service boundary reported API `ports=null`, API `expose=["3000"]`,
  and web as the only published service on the unique port `38167`.
- Exact `curl -i --max-time 10 http://127.0.0.1:38167/health` returned
  `HTTP/1.1 200 OK` and `{"status":"ok"}` through the web proxy. Exact
  `curl -i --max-time 10 http://127.0.0.1:38167/` returned `HTTP/1.1 200 OK`.
- `docker compose ... exec -T api id -u` and the corresponding web command
  both returned `1000`.
- The direct host probe on `127.0.0.1:3000` was rejected as evidence because
  an unrelated pre-existing `grafana` container owns that host port. Compose
  resolved metadata and project labels, not that ambiguous probe, establish
  the API boundary.
- Resolved Compose configuration and runtime logs contained no placeholder
  secret values. Existing Compose projects/resources were listed before the
  run and no pre-existing project name was targeted.

### Bundled prerequisite and cleanup

- `docker manifest inspect devlikeapro/waha:2026.8.1` exited 1 with
  `no such manifest: docker.io/devlikeapro/waha:2026.8.1`.
- Bundled resolved output retained the exact tag, `ports=null`,
  `expose=["3000"]`, no environment map, the credential-free exit-78
  entrypoint, and the declared `/app/.sessions` volume. No bundled startup,
  health, UID, linking, API-key, or delivery claim was made.
- External cleanup used only
  `docker compose ... -p relaynest-todo6-1787842433-2335137 down --volumes --remove-orphans`:
  exit 0; project-labeled containers, volumes, and networks were each 0.
- A separate unique bundled cleanup probe used
  `docker compose ... -p relaynest-todo6-bundled-clean --profile waha down --volumes --remove-orphans`:
  exit 0; bundled containers, volumes, and networks were each 0. No running
  task-owned containers or temporary secret directory remained.

### Fresh verdict

External Compose runtime boundaries and health gates are independently
verified. The bundled path remains explicitly **BLOCKED** by the unavailable
exact image manifest and unsupported runtime secret boundary; no replacement
tag or credential was introduced. Todo 6 is **fully verified for all available
checks and remains blocked only for the documented bundled prerequisite**.
