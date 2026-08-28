#!/bin/sh

set -eu

secret_file="${WAHA_API_KEY_FILE:-/run/secrets/waha_api_key}"

if [ ! -r "$secret_file" ]; then
  printf '%s\n' 'WAHA API key secret file is unavailable' >&2
  exit 78
fi

api_key="$(cat "$secret_file")"
case "$api_key" in
  *[![:space:]]*) ;;
  *)
  printf '%s\n' 'WAHA API key secret file is empty' >&2
  exit 78
  ;;
esac

export WAHA_API_KEY="$api_key"
unset WAHA_API_KEY_FILE

exec /usr/bin/tini -- /entrypoint.sh "$@"
