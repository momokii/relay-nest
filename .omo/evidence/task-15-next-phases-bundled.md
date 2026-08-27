# Todo 15 Slice 8 — Bundled WAHA prerequisite — 2026-08-25

## Status

**BLOCKED — Todo 15 bundled runtime remains open.** The exact image reference
`devlikeapro/waha:2026.8.1` is still unavailable from the configured Docker
registry. No replacement tag, `latest`, digest guess, real credential, WhatsApp
account, linking, or delivery claim was used.

## Scope and safety

- Repository: RelayNest (`wa-scheduler`), Docker context: `default`.
- Isolated Compose project: `relaynest-t15-bundled-20260825`.
- Compose files: `docker-compose.yml`, `docker-compose.override.yml`, and
  `docker-compose.bundled-waha.yml`; profile: `waha`.
- The exact image is declared in `docker-compose.yml:63` as
  `devlikeapro/waha:2026.8.1`; the bundled override keeps the API target
  internal at `http://waha:3000` (`docker-compose.bundled-waha.yml:4`).
- Existing labelled projects observed before the probe included `waha`,
  Grafana/monitoring, Cloudflare, Tailscale, and host PostgreSQL. They were not
  targeted. No existing project or volume was stopped, removed, or pruned.
- Preflight worktree was clean (`main...origin/main`, no changed files).
- No secret value was read or captured. The Compose-only validation supplied a
  redacted test placeholder for the required encryption variable; it was not a
  real credential.

## Exact registry and Compose results

Commands were run against the exact reference only:

1. Source inspection:

   ```text
   docker-compose.yml:63:       image: devlikeapro/waha:2026.8.1
   docker-compose.bundled-waha.yml:4:       WAHA_BASE_URL: http://waha:3000
   ```

2. `docker manifest inspect devlikeapro/waha:2026.8.1`

   ```text
   no such manifest: docker.io/devlikeapro/waha:2026.8.1
   manifest_exit=1
   ```

3. `docker pull devlikeapro/waha:2026.8.1`

   ```text
   Error response from daemon: manifest for devlikeapro/waha:2026.8.1 not found: manifest unknown: manifest unknown
   pull_exit=1
   ```

4. **Pre-correction historical receipt:** direct-key redacted merged configuration:
   `ENCRYPTION_MASTER_KEY=<redacted-test-placeholder> docker compose -p
   relaynest-t15-bundled-20260825 -f docker-compose.yml -f
   docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile
   waha config --quiet`

   ```text
   config_exit=0
   ```

   This is only configuration validation. It is not evidence that the image can
   be pulled or that the runtime can start.

## Isolated runtime attempt (pre-correction historical receipt)

The earlier exact command was:

```text
ENCRYPTION_MASTER_KEY=<redacted-test-placeholder> docker compose -p relaynest-t15-bundled-20260825 -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha up --build -d
```

Result: non-zero (`up_exit=1`) before service creation.

```text
 Image devlikeapro/waha:2026.8.1 Pulling
 Image devlikeapro/waha:2026.8.1 Error manifest for devlikeapro/waha:2026.8.1 not found: manifest unknown: manifest unknown
Error response from daemon: manifest for devlikeapro/waha:2026.8.1 not found: manifest unknown: manifest unknown
```

Because no service started, health checks and endpoint checks were **not run**:
there was no bundled WAHA `/health` or `/ping`, API `/health`, web endpoint, or
authenticated runtime to probe. No real WhatsApp linking or message delivery
was attempted or claimed.

## Cleanup proof

The project-scoped cleanup command was:

```text
ENCRYPTION_MASTER_KEY=<redacted-test-placeholder> docker compose -p relaynest-t15-bundled-20260825 -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha down --remove-orphans
```

```text
down_exit=0
```

Before and after cleanup, these exact project-label queries returned no rows:

```text
docker ps -a --filter label=com.docker.compose.project=relaynest-t15-bundled-20260825
docker volume ls --filter label=com.docker.compose.project=relaynest-t15-bundled-20260825
docker network ls --filter label=com.docker.compose.project=relaynest-t15-bundled-20260825
```

Result after cleanup:

```text
containers: [none]
volumes: [none]
networks: [none]
```

No `-v`, volume deletion, prune, or broad resource command was used.

## Required observations

- **Malformed/missing image:** The exact pinned manifest is missing; both direct
  registry inspection and pull failed with non-zero `manifest unknown`.
- **Stale state:** The older `.omo/evidence/compose-qa-2026-08-18.md` recorded
  the same exact-tag blocker. This fresh 2026-08-25 registry and runtime probe
  confirms it remains current; the prior report was not treated as proof by
  itself.
- **Dirty worktree:** The preflight worktree was clean. This evidence file is
  the sole intentional change made by this task; protected plans, boulder,
  ledger, and live state were not edited.
- **Long-command handling:** An initial shell attempt stored multiple `-f`
  arguments in one scalar. The shell passed it as a malformed path, producing a
  non-runtime error; its no-op cleanup resolved to the default project and
  reported `No resource found to remove for project "relaynest-dev"`. No
  existing resource was stopped. The runtime result above is from the corrected
  explicit-argument command, not that malformed attempt.
- **Misleading success avoidance:** `config --quiet` exited `0`, and cleanup
  exited `0`, but neither implies image availability or runtime health. The
  non-zero manifest/pull/up results therefore remain the authoritative outcome.
- **Cleanup:** The isolated project has zero containers, volumes, and networks
  after `down --remove-orphans`; existing `waha`, Grafana/monitoring, and host
  PostgreSQL resources remain outside the isolated project and untouched.

## Next action / bounded acceptance

Publish or otherwise make the exact `devlikeapro/waha:2026.8.1` registry
manifest available, then rerun this isolated slice with the same project-scoped
resource checks, `up --build -d`, dependency health checks, internal WAHA/API
health and endpoint checks, and cleanup. Until then, Todo 15 Slice 8 is
**BLOCKED**, not passed, and Todo 15 bundled runtime acceptance must remain
open.

## Post-review security correction — 2026-08-26

The bundled Compose service is now deliberately fail-closed: it contains no
`WAHA_API_KEY`, `WHATSAPP_API_KEY`, hash verifier, or undocumented `_FILE`
variable, and its overridden entrypoint exits with status 78 before the WAHA
process starts. This removes the prior resolved-config credential exposure but
does not make bundled runtime acceptance pass. The exact image remains
manifest-unavailable and the profile remains blocked pending a verified image
and supported secret boundary.

## Re-verification — 2026-08-26

### DoneClaim

- **Claim:** Slice 8 was re-verified without changing product code, protected
  plans, the execution ledger, committing, or pushing.
- **Exact image:** `devlikeapro/waha:2026.8.1` remains unavailable from Docker
  Hub using Docker context `default`, Docker client/server `29.3.1`.
- **Bundled runtime:** Not started because the exact image prerequisite failed.
- **Secret boundary:** Upstream WAHA security documentation and the exact
  upstream `core` entrypoint source support environment-based
  `WAHA_API_KEY`/`WHATSAPP_API_KEY` handling, including plaintext and
  `sha512:` forms. No Docker secret-file or `WAHA_API_KEY_FILE` handling is
  documented or present in that source. A hash is still an API credential and
  is not a supported resolved-config/inspection-safe boundary for this task.
- **Outcome:** Configuration-only checks and project-scoped cleanup passed;
  runtime acceptance remains blocked.

### Independent blocked/verified verdict

**BLOCKED — Todo 15 Slice 8 remains open.** The exact image prerequisite is not
available, and the supported secret boundary prerequisite is not available. The
credential-free fail-closed Compose boundary is verified, but it is not a
replacement for runtime acceptance. Todo 16 and F1-F4 remain blocked.

### Fresh exact registry receipts

Commands:

```text
docker manifest inspect devlikeapro/waha:2026.8.1
docker pull devlikeapro/waha:2026.8.1
```

Redacted results:

```text
no such manifest: docker.io/devlikeapro/waha:2026.8.1
manifest_exit=1

Error response from daemon: manifest for devlikeapro/waha:2026.8.1 not found: manifest unknown: manifest unknown
pull_exit=1
```

### Secret-boundary re-confirmation

- Upstream security source: `https://waha.devlike.pro/docs/how-to/security/`.
  It documents `WAHA_API_KEY` and `WHATSAPP_API_KEY` environment handling and
  the `sha512:{SHA512_HEX_HASH}` or plaintext credential forms.
- Exact upstream source: `https://github.com/devlikeapro/waha/blob/core/entrypoint.sh`.
  Its key handling reads the environment variables, hashes plaintext values,
  and exports the resulting API key; it does not read Docker secret files or a
  `WAHA_API_KEY_FILE` variable.
- No plaintext value, hash, secret-file content, or real credential was used
  or recorded. No wrapper, hash deployment, or undocumented variable was
  invented.

### Fresh bundled Compose rendering

Temporary Postgres/encryption files were created with mode `600`; their values
were never printed and were removed by the bounded cleanup trap. The merged
configuration command used explicit empty `WAHA_API_KEY`, `WHATSAPP_API_KEY`,
`WAHA_API_KEY_FILE`, and `ENCRYPTION_MASTER_KEY` environment values, plus the
temporary file paths:

```text
docker compose -p relaynest-t15-bundled-20260826 \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha config --format json
```

Redacted assertions:

```text
config_exit=0
placeholder_modes=600,600
secret_output_assertions=PASS
internal_port_and_fail_closed_assertions=PASS
web_only_host_port_assertion=PASS
temporary_secret_cleanup=PASS
```

The rendered output contained none of `WAHA_API_KEY`, `WHATSAPP_API_KEY`,
`sha512:`, or either temporary secret value. It verified no WAHA or API host
port, internal port `3000`, `waha-sessions:/app/.sessions`, `exit 78`, and
`restart: "no"`; only web had a host port, with container target `4173`.

### Runtime gate

The isolated command below was **not run** because both exact registry checks
failed:

```text
docker compose -p relaynest-t15-bundled-20260826 \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha up --build --wait -d
```

Therefore no bundled health, API/WAHA endpoint, container UID, image
inspection, WhatsApp linking, or message delivery result is claimed.

### Fresh project-scoped cleanup proof

```text
project=relaynest-t15-bundled-20260826
before_containers=0
before_volumes=0
before_networks=0
down_exit=0
after_containers=0
after_volumes=0
after_networks=0
temporary_secret_cleanup=PASS
```

Cleanup used only `docker compose ... down --remove-orphans` for the isolated
project. No `-v`, broad prune, unrelated project, or unrelated volume was
targeted.

### Adversarial-class notes and remaining gates

- `stale_state`: fresh manifest and pull probes were run; the prior evidence
  was not treated as proof.
- `dirty_worktree`: preflight branch/worktree was clean and remains limited to
  this evidence refresh.
- `long_commands`: registry and Compose commands were individually bounded;
  runtime startup was correctly skipped.
- `misleading_success_output`: `config_exit=0` and `down_exit=0` were not
  treated as image availability or runtime health.
- `generated_artifacts`: temporary secret files were mode `600` and removed;
  task-labeled resources are zero.
- `repeated_interruptions`: cleanup was trap-backed; no interrupted runtime
  existed and no rerun beyond bounded probes was needed.
- Full lint remains an explicit non-passed gate; this Slice 8 re-verification
  does not convert the known pre-existing analytics-fixture diagnostics into a
  pass. Fresh command result: `npx --yes pnpm@10.12.4 lint` exited `1` with
  `tests/task-13-analytics-db-fixture.ts:1:1 assist/source/organizeImports`
  and its format diagnostic (`Found 2 errors`). No WhatsApp linking or delivery
  is claimed.

## Fresh re-verification — 2026-08-27

### DoneClaim

- **Claim:** Todo 8 was rechecked with the exact pinned image and unique,
  disposable Compose projects. The result remains **BLOCKED**; no bundled
  runtime was started and no product code, plan, or execution ledger was
  changed.
- **Exact image:** `devlikeapro/waha:2026.8.1` remains unavailable from Docker
  context `default` (Docker client/server `29.3.1`).
- **Credential boundary:** no supported WAHA Docker-secret or `*_FILE` boundary
  is available in the verified contract. The merged bundled configuration
  injects no `WAHA_API_KEY`, `WHATSAPP_API_KEY`, hash verifier, or undocumented
  file variable; the credential-free guard exits `78` before the WAHA process.
  This is a safe blocker, not bundled runtime acceptance.

### Exact registry probes

```text
docker manifest inspect devlikeapro/waha:2026.8.1
docker pull devlikeapro/waha:2026.8.1
```

Redacted results:

```text
no such manifest: docker.io/devlikeapro/waha:2026.8.1
manifest_exit=1
Error response from daemon: manifest for devlikeapro/waha:2026.8.1 not found: manifest unknown: manifest unknown
pull_exit=1
```

No replacement tag, digest, `latest`, credential, WhatsApp account, linking,
or delivery claim was used.

### Safe merged-config boundary probe

Temporary files under `/tmp/opencode/` contained only non-secret placeholders,
were mode `600`, and were removed by probe traps. The probe used explicit
empty-environment isolation and `--env-file /dev/null` with placeholder
Postgres/encryption file paths:

```text
docker compose --env-file /dev/null -p <unique-project> \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha config --format json
```

`config_exit=0`. Redacted assertions:

```text
image=devlikeapro/waha:2026.8.1
waha_host_ports=NONE
api_host_ports=NONE
internal_expose=waha:3000,api:3000
credential_free_render=PASS
exit_78_guard=PASS
session_volume=PASS
web_only_host_port=PASS
```

The rendered configuration contained no WAHA key variable, `sha512:` value, or
placeholder value. A corrected explicit-argument config matrix also passed:

```text
base_config_exit=0 external_config_exit=0 bundled_config_exit=0
placeholder_modes=600,600 temp_cleanup=PASS
```

### Runtime gate and cleanup proof

Because both exact registry probes failed, this command was deliberately not
run:

```text
docker compose -p <unique-project> -f docker-compose.yml \
  -f docker-compose.override.yml -f docker-compose.bundled-waha.yml \
  --profile waha up --build --wait -d
```

Therefore no bundled health, API/WAHA endpoint, UID, immutable image inspect,
linking, or delivery result is claimed. Project-scoped cleanup used only:

```text
docker compose --env-file /dev/null -p <unique-project> \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha down --remove-orphans
```

The completed project-scoped cleanup command returned `down_exit=0`; exact
project-label audits for all four disposable probe projects returned:

```text
containers=0 volumes=0 networks=0
```

No `-v`, prune, existing project, or unrelated volume was targeted. A first
config harness passed Compose options as one shell scalar and returned an
`unknown flag` harness error; it created no resources and was superseded by the
correct explicit-argument probe.

### Required checks and adversarial classes

- `npx --yes pnpm@10.12.4 exec vitest run tests/compose-startup.test.ts tests/compose-external-proxy.test.ts` — **PASS**, `2 files, 11 tests`.
- `npx --yes pnpm@10.12.4 run docs:check` — **PASS**.
- `npx --yes pnpm@10.12.4 run secret-scan` — **PASS**.
- `npx --yes pnpm@10.12.4 run verify:scope` — **PASS**.
- `npx --yes pnpm@10.12.4 typecheck` — **PASS**.
- `npx --yes pnpm@10.12.4 build` — **PASS**.
- `GIT_MASTER=1 git diff --check` — **PASS**.
- `npx --yes pnpm@10.12.4 lint` — **NOT PASSED**: six diagnostics from
  workstation `/etc` traversal/permission paths and the pre-existing
  `tests/task-13-analytics-db-fixture.ts` import/format diagnostics; no task
  file was changed to bypass them.
- `stale_state`, `missing_manifest`, `unsupported_secret_boundary`,
  `credential_leakage`, `host_port_exposure`, `false_health_claim`,
  `malformed_probe_arguments`, `temporary_secret_cleanup`, and
  `project_resource_cleanup` were checked. No secret value was printed or
  recorded.

### Bounded acceptance

**BLOCKED — Todo 8 and Todo 15 remain open.** Make the exact pinned manifest
available and establish a documented, runtime-tested supported credential
boundary before rerunning bundled startup, health, immutable image, UID,
persistence, and cleanup QA. Todo 16 and F1-F4 remain open; this receipt does
not alter any protected plan or ledger completion marker.
