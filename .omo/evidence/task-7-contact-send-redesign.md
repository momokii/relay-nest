# Todo 7 deployment evidence

Date: 2026-08-30

## Commands and results

The first rebuild was safely stopped by an existing `relaynest-web-1` binding
on `127.0.0.1:38080`. No container or volume was deleted. The stack was then
rebuilt with the requested runtime binding using secret file paths only:

```text
ENCRYPTION_MASTER_KEY_FILE=./.secrets/encryption_master_key
WAHA_API_KEY_FILE=./.secrets/waha_api_key
WEB_BIND_ADDRESS=100.124.184.116 WEB_PORT=8081 npx --yes pnpm@10.12.4 dev:bundled
PASS: API, web, Postgres, and bundled WAHA built/started healthy.

curl -fsS -I --max-time 10 http://100.124.184.116:8081/
PASS: HTTP/1.1 200 OK.

docker compose -p relaynest-dev -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.bundled-waha.yml --profile waha ps
PASS: relaynest-dev web, api, postgres, and waha are healthy; web publishes 100.124.184.116:8081.
```

Named volumes were preserved. Secret contents and application payloads were not
recorded.
