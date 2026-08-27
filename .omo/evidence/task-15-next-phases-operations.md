# Todo 15 Operations Verification, 2026-08-25

## Scope and safety

This artifact records the Todo 15 operations and documentation slice. Commands
used placeholder secret files only. No real credentials were read, printed,
resolved, or retained. Bundled WAHA was not started, and no WhatsApp account
was linked or used for delivery testing.

The repository was already a dirty WIP at the start. Protected
`.omo/plans/*` and `.omo/start-work/ledger.jsonl` were not edited.

## Repository and Compose source facts

```text
git status --short --branch
main...origin/main
existing uncommitted Compose/Docker/application changes present

git rev-parse HEAD
0cac56c9ec02eba0ef6e7b1e80bbccf1bc882687

git rev-parse --verify origin/main
0cac56c9ec02eba0ef6e7b1e80bbccf1bc882687
```

The source inspection confirmed that `docker-compose.yml` defines PostgreSQL,
API, web, and the profile-gated WAHA service. Only web has `ports`; API and
WAHA have internal `expose: "3000"`. The API entrypoint runs migrations before
`app.listen`. The bundled service mounts `waha-sessions:/app/.sessions`.

## Passed external-mode checks

Exact configuration checks with generated mode-600 placeholder secret files:

```text
docker compose -f docker-compose.yml -f docker-compose.override.yml config --quiet
exit 0

docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.external-waha.yml config --quiet
exit 0
```

Required-value checks with an explicit empty environment file failed closed:

```text
external mode without WAHA_BASE_URL: exit 1
bundled mode: no WAHA credential is required; rendered config is credential-free and the service exits 78 before WAHA starts
base mode without ENCRYPTION_MASTER_KEY_FILE: exit 1
```

Focused verification results:

```text
npx --yes pnpm@10.12.4 exec vitest run tests/compose-startup.test.ts tests/compose-external-proxy.test.ts
2 files, 11 tests passed

npx --yes pnpm@10.12.4 exec biome check tests/compose-startup.test.ts tests/compose-external-proxy.test.ts
passed

npx --yes pnpm@10.12.4 typecheck
passed

npx --yes pnpm@10.12.4 build
passed: config, domain, WAHA contracts, API, and web builds
```

Disposable external runtime QA used the base, override, and external files
with a unique project and a generated placeholder provider URL. `up --build
--wait --wait-timeout 180 -d` passed. PostgreSQL became healthy before API, API
became healthy before web, and all three services became healthy. The web root
returned HTTP 200 and same-origin `/health` returned HTTP 200. Docker inspect
reported no host binding for API `3000/tcp`; web was the only published port.
API and web ran as UID 1000. No direct API host endpoint was used.

## Bundled checks and blockers

Merged bundled configuration validation passed with a redacted placeholder:

```text
docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha config --quiet
exit 0
```

The exact image availability checks failed:

```text
docker manifest inspect devlikeapro/waha:2026.8.1
no such manifest: docker.io/devlikeapro/waha:2026.8.1
exit 1

docker pull devlikeapro/waha:2026.8.1
manifest for docker.io/devlikeapro/waha:2026.8.1 not found: manifest unknown
exit 1
```

Bundled `up` therefore failed before service creation with the same manifest
error. No bundled health, UID, API-key runtime behavior, linking, or delivery
claim is made. No replacement tag or digest was guessed. The merged config
contains no `WAHA_API_KEY`, `WHATSAPP_API_KEY`, or `sha512:` verifier. The
bundled service is configured to exit with status 78 before the WAHA process
starts. This is a deliberate fail-closed security boundary, not bundled
runtime acceptance; the artifact does not assume any safe file-backed WAHA
injection mechanism.

## Full-lint boundary

```text
npx --yes pnpm@10.12.4 lint
blocked by the pre-existing diagnostics in tests/task-13-analytics-db-fixture.ts
```

Full lint is not claimed as passed. The focused changed-file Biome check above
passed.

## Cleanup

Disposable external and bundled probe projects were cleaned with project-scoped
Compose commands using `down --remove-orphans`. The task-owned containers,
networks, and temporary secret directory were removed. The bundled probe had no
created service or volume. Label-filtered post-cleanup checks reported no
task-owned containers, volumes, or networks. Existing WAHA, monitoring,
database, VPN, and other host resources were not targeted. No broad prune and
no production `waha-sessions` volume deletion was performed.

## Acceptance status

External-mode Compose operations are verified. Bundled runtime remains blocked
by the unavailable image and unsupported secret boundary, but its configuration
now fails closed without interpolating a credential. Todo 15 stays open; this
evidence does not claim full lint, bundled health, WhatsApp linking, or message
delivery.

## Fresh Todo 7 reconciliation verification, 2026-08-27

### Baseline and source reconciliation

```text
GIT_MASTER=1 git rev-parse HEAD
2cebc7ddf383b9a9e94c095dcc2a6ac756ddc2a2

GIT_MASTER=1 git rev-parse origin/main
2cebc7ddf383b9a9e94c095dcc2a6ac756ddc2a2

GIT_MASTER=1 git status --short --branch
## main...origin/main
```

The protected `.omo/plans/*` records and `.omo/start-work/ledger.jsonl` were
not edited. The initial `npx --yes pnpm@10.12.4 run docs:check` passed. The
initial Compose tests passed `2 files, 11 tests`; focused Compose Biome and
typecheck passed. The initial local Markdown scan reported `60` Markdown files
and `0` missing local links.

### Documentation and release checks

```text
npx --yes pnpm@10.12.4 run docs:check
exit 0

npx --yes pnpm@10.12.4 secret-scan
exit 0, no diagnostics

npx --yes pnpm@10.12.4 verify:scope
exit 0, no diagnostics

npx --yes pnpm@10.12.4 exec vitest run tests/release-docs-input.test.ts tests/release-docs-traversal.test.ts tests/release-package.test.ts tests/release-requirements.test.ts tests/release-requirements-bounds.test.ts tests/release-requirements-integrity.test.ts tests/release-docs-links-basic.test.ts tests/release-docs-links-fenced.test.ts tests/release-docs-link-budget.test.ts tests/release-docs-structure.test.ts tests/release-docs-freshness.test.ts tests/release-scope.test.ts tests/release-secret-scan.test.ts
13 files, 101 tests passed

npx --yes pnpm@10.12.4 typecheck
exit 0

npx --yes pnpm@10.12.4 build
exit 0, config, domain, WAHA contracts, API, and web builds passed

GIT_MASTER=1 git diff --check
exit 0
```

The local Markdown scan was rerun after editing and reported `0` missing local
links. Full `npx --yes pnpm@10.12.4 lint` was not a pass: it reported permission
diagnostics for unrelated `/etc` paths and the pre-existing diagnostics in
`tests/task-13-analytics-db-fixture.ts`. No source or test was changed to hide
that failure.

### Compose configuration and failure paths

With generated placeholder-only secret files, both files mode `600`, and an
explicit `--env-file /dev/null` to prevent ambient `.env` values:

```text
docker compose --env-file /dev/null -p relaynest-docs-baseline -f docker-compose.yml -f docker-compose.override.yml config --quiet
exit 0

docker compose --env-file /dev/null -p relaynest-docs-baseline -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config --quiet
exit 0

docker compose --env-file /dev/null -p relaynest-bundled-config -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha config --format json
exit 0; bundled image is devlikeapro/waha:2026.8.1, ports are absent, environment keys are empty, entrypoint is the credential-free exit-78 guard, and /app/.sessions uses the named waha-sessions volume

docker compose --env-file /dev/null -p relaynest-docs-missing -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config --quiet
exit 1; required variable WAHA_BASE_URL is missing a value

docker manifest inspect devlikeapro/waha:2026.8.1
exit 1; no such manifest: docker.io/devlikeapro/waha:2026.8.1
```

All secret values were placeholders, were not printed, and were removed with
their temporary directory. No replacement image, digest, WAHA credential, or
undocumented `_FILE` behavior was introduced.

### Disposable external Compose QA

The documented external command was run with unique project
`relaynest-task7-1787843671`, a dynamically allocated host port `58021`, and
placeholder-only provider and secret files:

```text
docker compose --env-file /dev/null -p relaynest-task7-1787843671 -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml up --build --wait --wait-timeout 180 -d
exit 0
services=api:healthy,postgres:healthy,web:healthy
root_http=200 health_http=200
api_ports={"3000/tcp":null}
api_uid=1000
web_uid=1000
secret_modes=600 600
secret_values_in_startup_log=NONE
```

This proves the external Compose ordering, API readiness, same-origin proxy,
private API port, and non-root application runtime boundary only. It did not
contact WAHA, link an account, or test recipient delivery or account safety.

Cleanup used only the unique project:

```text
docker compose --env-file /dev/null -p relaynest-task7-1787843671 -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml down --volumes --remove-orphans
exit 0
containers=0, volumes=0, networks=0; temporary secret directory removed
```

No unrelated project, volume, port, WAHA account, or production resource was
targeted. Todo 7 remains open until the orchestrator independently verifies the
tranche and handles the protected plan and ledger records.
