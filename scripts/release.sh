#!/usr/bin/env bash

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { printf 'release failed: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "docker CLI not found; install Docker Engine first"
command -v openssl >/dev/null 2>&1 || fail "openssl not found; install OpenSSL first"

CONTAINER="relaynest-release-test-$$"
PASSWORD="$(openssl rand -hex 24)"
KEY="$(openssl rand -base64 32)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --rm -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  -e POSTGRES_DB=relaynest_release \
  -p 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

READY=0
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d relaynest_release >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" = "1" ] || fail "disposable PostgreSQL did not become ready"

PORT_MAPPING="$(docker port "$CONTAINER" 5432/tcp)"
PORT="${PORT_MAPPING##*:}"
[ -n "$PORT" ] || fail "could not determine disposable PostgreSQL port"

DATABASE_URL="postgresql://postgres:${PASSWORD}@127.0.0.1:${PORT}/relaynest_release"
export DATABASE_URL
export TASK5_AUTH_DATABASE_URL="$DATABASE_URL"
export TASK11_DATABASE_URL="$DATABASE_URL"
export TASK12_DATABASE_URL="$DATABASE_URL"
export TASK13_DATABASE_URL="$DATABASE_URL"
export TASK13_ANALYTICS_DATABASE_URL="$DATABASE_URL"
export TASK14_DATABASE_URL="$DATABASE_URL"
export TASK14_AUTH_SESSION_DATABASE_URL="$DATABASE_URL"
export RUN_POSTGRES_TESTS=1
export ENCRYPTION_MASTER_KEY="$KEY"

pnpm run build
pnpm run typecheck
pnpm run db:migrate
pnpm run test -- --fileParallelism=false
pnpm run test:e2e
pnpm audit --audit-level=high
pnpm run verify:requirements
pnpm run secret-scan
pnpm run verify:scope
pnpm run docs:check
