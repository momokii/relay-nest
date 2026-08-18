# Default Compose rebuild receipt — 2026-08-18

## Scope and safety

- Repository: RelayNest working tree.
- Compose invocation: plain `docker compose` from the repository root.
- Selected project before the operation: only `relaynest-dev-*` containers were
  shown by plain `docker compose ps`.
- The isolated `relaynest-compose-external-qa-*` project, `waha-waha-1`,
  Grafana, monitoring, and host PostgreSQL were not targeted.
- No `.env`, secret, product source, Compose configuration, or volume was
  edited or deleted.
- The bundled `waha` profile was not selected. No bundled WAHA functionality is
  claimed.

## Exact commands and results

### Pre-operation inspection

Command:

```text
docker compose ps
```

Result (redacted to service/container status and ports):

```text
relaynest-dev-api-1       api       Created 23 hours ago   Up 23 hours (healthy)   0.0.0.0:33000->3000/tcp
relaynest-dev-postgres-1  postgres  Created 23 hours ago   Up 23 hours (healthy)   5432/tcp
relaynest-dev-web-1       web       Created 23 hours ago   Up 17 hours             0.0.0.0:38080->4173/tcp
```

### Stop and rebuild/restart

Commands, run in this order:

```text
docker compose down --remove-orphans
docker compose up --build -d
```

Results:

- `down --remove-orphans`: exit 0; only the three `relaynest-dev-*` containers
  and their default Compose network were stopped/removed.
- `up --build -d`: exit 0; API and web images were rebuilt from the working
  tree, PostgreSQL/API health gates passed, and all three services started.
- No `-v` option was used.

### Post-operation status

Command:

```text
docker compose ps
```

Result (redacted to service/container status and ports):

```text
relaynest-dev-api-1       api       Created 46 seconds ago   Up 40 seconds (healthy)   0.0.0.0:33000->3000/tcp
relaynest-dev-postgres-1  postgres  Created 46 seconds ago   Up 45 seconds (healthy)   5432/tcp
relaynest-dev-web-1       web       Created 46 seconds ago   Up 29 seconds             0.0.0.0:38080->4173/tcp
```

Container health summaries:

```text
postgres status=running health=healthy
api      status=running health=healthy
web      status=running health=none (no Compose healthcheck configured)
```

Retained-volume check:

```text
postgres_data_volume_present=yes
```

## Endpoint verification

Commands:

```text
curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:33000/health
curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:38080/
```

Redacted results:

```text
api_health_port=33000 status=200
web_root_port=38080 status=200
```

Protected unrelated-container presence check remained positive:

```text
relaynest-compose-external-qa-*  Up (including healthy API/PostgreSQL)
waha-waha-1                     Up
grafana                         Up (healthy)
```

## Retention and closeout

- Default stack is intentionally left running.
- PostgreSQL data volume was retained; no volume deletion or pruning occurred.
- No partial-resource cleanup was needed because startup and endpoint checks
  passed.
- No real WAHA credentials were used or exposed in this receipt.
