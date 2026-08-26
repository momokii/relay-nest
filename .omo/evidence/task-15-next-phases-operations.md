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
