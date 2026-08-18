# Bundled-WAHA Compose QA — 2026-08-18

## Scope

- Compose project: `relaynest-compose-qa`
- Required files used, in order: `docker-compose.yml`,
  `docker-compose.override.yml`, `docker-compose.bundled-waha.yml`
- Profile: `waha`
- No product source, Compose file, or existing environment file was modified.
- Existing `.env` was preserved. Secret values, resolved configuration, URLs,
  database credentials, and logs were not captured here.

## Host safety preflight

- Existing host port `3000` was occupied by Grafana.
- Existing RelayNest ports were `33000` (API) and `38080` (web).
- Selected alternate host ports: API `33001`; web `38081`.
- Port checks before launch: `33001=free`; `38081=free`.
- `.secrets/postgres_password` was present, ignored, and mode `600`; its value
  was not read or printed.
- Existing resources observed included `relaynest-dev-*`, Grafana, WAHA,
  monitoring containers, and host PostgreSQL. None were targeted.

## Commands and results

1. `API_PORT=33001 WEB_PORT=38081 docker compose -p relaynest-compose-qa -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha config --quiet`
   - Result: success.
2. `API_PORT=33001 WEB_PORT=38081 docker compose -p relaynest-compose-qa -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha up --build -d`
   - Result: blocked before service creation. Docker reported:
     `manifest for devlikeapro/waha:2026.8.1 not found: manifest unknown`.
3. `docker ps -a --filter label=com.docker.compose.project=relaynest-compose-qa`
   - Result: no isolated project containers.
4. `docker volume ls --filter label=com.docker.compose.project=relaynest-compose-qa`
   - Result: no isolated project volumes.
5. `docker network ls --filter label=com.docker.compose.project=relaynest-compose-qa`
   - Result: no isolated project networks.
6. `API_PORT=33001 WEB_PORT=38081 docker compose -p relaynest-compose-qa -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha down --remove-orphans`
   - Result: success/no-op; `-v`, volume deletion, prune, and resource deletion
     of existing projects were not used.

## Health verification

- Not run: no PostgreSQL, API, web, or bundled-WAHA service started.
- API `/health` and web HTTP checks therefore have no result.
- No authenticated browser QA was performed.

## Blocker

The exact bundled Compose file pins `devlikeapro/waha:2026.8.1`, but that
registry manifest is unavailable. The tag must be corrected or published before
the required isolated rebuild/startup and health checks can proceed. No tag was
guessed and no Compose file was changed.

## Cleanup/retention receipt

- Isolated project name retained for traceability: `relaynest-compose-qa`.
- Running isolated resources: none.
- Retained isolated volumes: none created.
- Cleanup command completed: `down --remove-orphans` only.
- Existing `relaynest-dev-*`, Grafana, WAHA, monitoring, and host PostgreSQL
  resources were left untouched.
