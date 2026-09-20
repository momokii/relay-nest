#!/usr/bin/env bash
set -eu

MODE="${1:-}"
case "$MODE" in
  bundled|external|dev) ;;
  *)
    printf '%s\n' "usage: bash scripts/trust-report.sh [bundled|external|dev]" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '%s\n' "$*"; }
fail() { printf 'trust report failed: %s\n' "$*" >&2; exit 1; }

say "RelayNest trust report"
say "mode: $MODE"
say "version: $(node -p "require('./package.json').version")"
say "commit: $(git rev-parse --short HEAD 2>/dev/null || printf unknown)"

npx --yes pnpm@10.12.4 secret-scan || fail "secret scan did not pass"
npx --yes pnpm@10.12.4 verify:scope || fail "scope verification did not pass"
npx --yes pnpm@10.12.4 docs:check || fail "documentation verification did not pass"

config_file="$(mktemp)"
trap 'rm -f "$config_file"' EXIT
export ENCRYPTION_MASTER_KEY_FILE="${ENCRYPTION_MASTER_KEY_FILE:-$ROOT/.secrets/encryption_master_key}"
export WAHA_API_KEY_FILE="${WAHA_API_KEY_FILE:-$ROOT/.secrets/waha_api_key}"
case "$MODE" in
  bundled|dev)
    docker compose -f docker-compose.yml -f docker-compose.override.yml \
      -f docker-compose.bundled-waha.yml --profile waha config > "$config_file"
    ;;
  external)
    : "${WAHA_BASE_URL:?Set WAHA_BASE_URL for the external-WAHA deployment}"
    docker compose -f docker-compose.yml -f docker-compose.override.yml \
      -f docker-compose.external-waha.yml config > "$config_file"
    ;;
esac

grep -q 'published: "3000"' "$config_file" && fail "private API or WAHA port 3000 is published"
grep -q 'org.opencontainers.image.version' Dockerfile.api || fail "API OCI version label is absent"
bash scripts/healthcheck.sh "$MODE" || fail "deployment health verification did not pass"

say "PASS: no tracked secret pattern, scope isolation checks, documentation checks, private-port Compose guard, OCI version label, and deployment health all passed"
say "This report confirms implemented controls and deployment state; it does not guarantee WhatsApp account safety or recipient delivery."
