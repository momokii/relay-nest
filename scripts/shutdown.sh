#!/usr/bin/env bash
set -eu

MODE="${1:-}"
case "$MODE" in
  bundled|external) PROJECT="relaynest" ;;
  dev) PROJECT="relaynest-dev" ;;
  *)
    printf '%s\n' "usage: bash scripts/shutdown.sh [bundled|external|dev]" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { printf 'shutdown failed: %s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || fail "docker CLI not found"
docker compose version >/dev/null 2>&1 || fail "'docker compose' (Compose v2) not found"

export ENCRYPTION_MASTER_KEY_FILE="${ENCRYPTION_MASTER_KEY_FILE:-$ROOT/.secrets/encryption_master_key}"
export WAHA_API_KEY_FILE="${WAHA_API_KEY_FILE:-$ROOT/.secrets/waha_api_key}"

[ -s "$ENCRYPTION_MASTER_KEY_FILE" ] || fail "encryption key file is missing or empty"
if [ "$MODE" != "external" ]; then
  [ -s "$WAHA_API_KEY_FILE" ] || fail "WAHA API key file is missing or empty"
fi

case "$MODE" in
  bundled|dev)
    docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.override.yml \
      -f docker-compose.bundled-waha.yml --profile waha down --remove-orphans
    ;;
  external)
    docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.override.yml \
      -f docker-compose.external-waha.yml down --remove-orphans
    ;;
esac

printf '%s\n' "stopped $PROJECT ($MODE); named volumes were preserved"
