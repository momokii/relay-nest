#!/usr/bin/env bash
#
# One-click RelayNest setup for every supported deployment.
#
#   bash scripts/setup.sh bundled    # postgres + api + web + own WAHA (project: relaynest)
#   bash scripts/setup.sh external   # postgres + api + web, talks to your WAHA (project: relaynest)
#   bash scripts/setup.sh dev        # disposable bundled stack (project: relaynest-dev)
#
# The script checks prerequisites, creates missing secret files (never
# overwrites existing ones — regenerating the encryption key against an
# existing database would lock you out), validates them, warns on busy ports,
# and then runs the matching Docker Compose command. Every deployment runs as
# Docker Compose services; there is no bare-metal production path.
#
# Environment honored by the script:
#   WAHA_BASE_URL      required for "external": your WAHA, reachable from the api container
#   WEB_BIND_ADDRESS   default 127.0.0.1 (set a trusted LAN/VPN address to expose, e.g. Tailscale IP)
#   WEB_PORT           default 8080 (dev mode defaults to 8081 so it never clashes with prod)

set -eu

MODE="${1:-}"
case "$MODE" in
  bundled|external|dev) ;;
  *)
    printf '%s\n' "usage: bash scripts/setup.sh [bundled|external|dev]" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '%s\n' "$*"; }
fail() { printf 'setup failed: %s\n' "$*" >&2; exit 1; }

# 1. Docker Engine with Compose v2 ------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker CLI not found; install Docker Engine first"
docker compose version >/dev/null 2>&1 || fail "'docker compose' (Compose v2) not found"

# 2. Secret files: create only when missing ---------------------------------------
umask 077
mkdir -p .secrets
chmod 700 .secrets

make_secret() {
  # $1 = filename, $2 = generator args for openssl rand
  if [ -s ".secrets/$1" ]; then
    say "keep   .secrets/$1 (already exists, never overwritten)"
  else
    # shellcheck disable=SC2086
    openssl rand $2 > ".secrets/$1"
    chmod 600 ".secrets/$1"
    say "created .secrets/$1"
  fi
}

make_secret postgres_password "-hex 24"
make_secret encryption_master_key "-base64 32"
make_secret waha_webhook_secret "-hex 24"
if [ "$MODE" != "external" ]; then
  make_secret waha_api_key "-hex 24"
fi

# 3. Validate secrets --------------------------------------------------------------
for name in postgres_password encryption_master_key waha_webhook_secret; do
  [ -s ".secrets/$name" ] || fail ".secrets/$name is missing or empty"
done
if [ "$MODE" != "external" ]; then
  [ -s ".secrets/waha_api_key" ] || fail ".secrets/waha_api_key is missing or empty"
fi
key_bytes="$(openssl base64 -d -in .secrets/encryption_master_key 2>/dev/null | wc -c | tr -d ' ')"
[ "$key_bytes" = "32" ] || fail ".secrets/encryption_master_key does not decode to 32 bytes"

# 4. Mode-specific inputs ------------------------------------------------------------
if [ "$MODE" = "external" ] && [ -z "${WAHA_BASE_URL:-}" ]; then
  fail "external mode needs WAHA_BASE_URL exported, e.g. WAHA_BASE_URL=https://waha.internal.example"
fi

export ENCRYPTION_MASTER_KEY_FILE="$ROOT/.secrets/encryption_master_key"
export WAHA_API_KEY_FILE="$ROOT/.secrets/waha_api_key"

BIND="${WEB_BIND_ADDRESS:-127.0.0.1}"
if [ -n "${WEB_PORT:-}" ]; then
  PORT="$WEB_PORT"
elif [ "$MODE" = "dev" ]; then
  PORT="8081"
  export WEB_PORT="$PORT"
  say "note   WEB_PORT unset: dev mode defaults to 8081 so it never clashes with prod on 8080"
else
  PORT="8080"
fi

# 5. Port check (warning only: the address may belong to our own healthy stack) -----
if command -v ss >/dev/null 2>&1; then
  if ss -tln 2>/dev/null | grep -qE "[:.]$PORT([[:space:]]|$)"; then
    say "warn   something already listens on port $PORT — 'up' will fail if it is not this stack; set WEB_PORT to a free port to run side by side"
  fi
fi

# 6. Compose up ------------------------------------------------------------------------
case "$MODE" in
  bundled)
    docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml \
      -f docker-compose.bundled-waha.yml --profile waha up --build --wait -d
    PROJECT="relaynest"
    ;;
  external)
    docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml \
      -f docker-compose.external-waha.yml up --build --wait -d
    PROJECT="relaynest"
    ;;
  dev)
    docker compose -p relaynest-dev -f docker-compose.yml -f docker-compose.override.yml \
      -f docker-compose.bundled-waha.yml --profile waha up --build --wait -d
    PROJECT="relaynest-dev"
    ;;
esac

# 7. Report ------------------------------------------------------------------------------
docker compose -p "$PROJECT" ps
say ""
say "dashboard: http://$BIND:$PORT"
say "first visit: choose 'Create the first Admin' (bootstrap works only on an empty user table)"
