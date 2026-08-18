# External-WAHA Compose QA — 2026-08-18

## Scope and safety

- Compose project: `relaynest-compose-external-qa`
- Required files used, in order: `docker-compose.yml`,
  `docker-compose.override.yml`, `docker-compose.external-waha.yml`
- External WAHA endpoint override: intentionally unavailable loopback port 9;
  no existing WAHA service or account was contacted.
- The WAHA API key was a generated non-production placeholder supplied only to
  the command environment; its value is not recorded.
- Existing `.env` and `.secrets/postgres_password` were preserved. The password
  value and all resolved configuration were not read into this evidence.
- Bundled WAHA was not selected, and no WAHA container was created.
- Existing `relaynest-dev-*`, `waha-waha-1`, Grafana, monitoring, and host
  PostgreSQL resources were inspected only and left untouched.

## Host preflight

- Docker Compose: `v5.1.1`
- Existing occupied ports: `3000` (Grafana), `33000` (existing RelayNest API),
  `38080` (existing RelayNest web), `5432` (host PostgreSQL).
- Selected host ports: API `33001`; web `38081`.
- Preflight result: `33001=free`; `38081=free`.
- Existing PostgreSQL secret metadata: present, mode `600`; value not printed.

## Exact commands and results

1. `API_PORT=33001 WEB_PORT=38081 WAHA_BASE_URL=http://127.0.0.1:9 WAHA_API_KEY="$(printf 'relaynest-external-qa-%s' "$$")" docker compose -p relaynest-compose-external-qa -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml config --quiet`
   - Result: success; no output.
2. `API_PORT=33001 WEB_PORT=38081 WAHA_BASE_URL=http://127.0.0.1:9 WAHA_API_KEY="$(printf 'relaynest-external-qa-%s' "$$")" docker compose -p relaynest-compose-external-qa -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.external-waha.yml up --build -d`
   - Result: success. API and web images rebuilt; PostgreSQL, API, and web
     containers started. Isolated network and PostgreSQL volume were created.
3. Health/status inspection with `docker compose ... ps` and `docker inspect`:
   - `postgres=healthy`, `api=healthy`, `web=running`.
   - API published as `33001->3000`; web published as `38081->4173`.
4. `curl --silent --show-error --max-time 10 -o /dev/null -w 'status=%{http_code} bytes=%{size_download} content_type=%{content_type}' http://127.0.0.1:33001/health`
   - Result: `status=200 bytes=15 content_type=application/json; charset=utf-8`.
     Body summary: JSON body redacted.
5. `curl --silent --show-error --max-time 10 -o /dev/null -w 'status=%{http_code} bytes=%{size_download} content_type=%{content_type}' http://127.0.0.1:38081/`
   - Result: `status=200 bytes=505 content_type=text/html`.
     Body summary: HTML body redacted.

## Isolated resources

- Containers: `relaynest-compose-external-qa-postgres-1` (healthy),
  `relaynest-compose-external-qa-api-1` (healthy),
  `relaynest-compose-external-qa-web-1` (running).
- Network: `relaynest-compose-external-qa_default`.
- Volume: `relaynest-compose-external-qa_postgres-data`.

## Cleanup and retention receipt

- The isolated project is intentionally left running for the parent’s Todo 14
  implementation and follow-up dashboard verification.
- No `down`, volume deletion, prune, or cleanup command was run after startup.
- Retained resources are limited to the three containers, one project network,
  and one project PostgreSQL volume listed above.
- No authenticated browser QA, WAHA functionality, account access, or message
  delivery was claimed or performed.
