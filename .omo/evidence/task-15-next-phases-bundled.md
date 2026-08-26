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
