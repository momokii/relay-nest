#!/usr/bin/env bash
set -eu

MODE="${1:-}"
case "$MODE" in
  bundled|external) PROJECT="relaynest" ;;
  dev) PROJECT="relaynest-dev" ;;
  *)
    printf '%s\n' "usage: bash scripts/healthcheck.sh [bundled|external|dev]" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { printf 'health check failed: %s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || fail "docker CLI not found"
docker compose version >/dev/null 2>&1 || fail "'docker compose' (Compose v2) not found"

export ENCRYPTION_MASTER_KEY_FILE="${ENCRYPTION_MASTER_KEY_FILE:-$ROOT/.secrets/encryption_master_key}"
export WAHA_API_KEY_FILE="${WAHA_API_KEY_FILE:-$ROOT/.secrets/waha_api_key}"

compose() {
  case "$MODE" in
    bundled|dev)
      docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.override.yml \
        -f docker-compose.bundled-waha.yml --profile waha "$@"
      ;;
    external)
      docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.override.yml \
        -f docker-compose.external-waha.yml "$@"
      ;;
  esac
}

expected="postgres api web"
[ "$MODE" = "external" ] || expected="$expected waha"
for service in $expected; do
  status="$(compose ps --status running --services | grep -Fx "$service" || true)"
  [ "$status" = "$service" ] || fail "$service is not running"
done

compose exec -T postgres pg_isready -U app -d waha_command_center >/dev/null || fail "PostgreSQL is not ready"
api_version="$(compose exec -T api node -e "fetch('http://127.0.0.1:3000/version').then(async response => { if (!response.ok) process.exit(1); process.stdout.write(JSON.stringify(await response.json())) }).catch(() => process.exit(1))")" || fail "API /version is unavailable"
expected_version="$(node -p "require('./package.json').version")"
printf '%s' "$api_version" | node -e "let data=''; process.stdin.on('data', chunk => data += chunk).on('end', () => { const value = JSON.parse(data); process.exit(value.version === process.argv[1] ? 0 : 1) })" "$expected_version" || fail "API version does not match package.json"
compose exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))" || fail "API /health is unavailable"
compose exec -T web node -e "fetch('http://127.0.0.1:4173/').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))" || fail "web dashboard is unavailable"

if [ "$MODE" != "external" ]; then
  compose exec -T waha node -e "const fs = require('node:fs'); const key = fs.readFileSync('/run/secrets/waha_api_key', 'utf8').trim(); fetch('http://127.0.0.1:3000/health', { headers: { 'X-Api-Key': key } }).then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))" || fail "bundled WAHA is unavailable"
fi

api_image="$(compose images -q api)"
[ -n "$api_image" ] || fail "API image was not found"
image_version="$(docker image inspect "$api_image" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}')"
[ "$image_version" = "$expected_version" ] || fail "API OCI version label does not match package.json"

printf '%s\n' "healthy: $PROJECT ($MODE), version $expected_version"
if [ "$MODE" = "external" ]; then
  printf '%s\n' "note: external WAHA provider reachability is not probed; its credentials remain server-side"
fi
