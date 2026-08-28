# Bundled WAHA runtime verification

Date: 2026-08-28  
Repository: RelayNest  
Classification: **IMPLEMENTATION VERIFIED; protected release checkbox open**

## Image and boundary

- Published image tag: `devlikeapro/waha:latest-2026.8.1`.
- Selected image digest:
  `sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca`.
- The dated `devlikeapro/waha:2026.8.1` tag has no registry manifest and is not
  used.
- `Dockerfile.waha` pins the published image by digest and installs the
  repository-owned `docker/waha-entrypoint.sh` wrapper.
- Bundled Compose mounts `waha_api_key` at `/run/secrets/waha_api_key`, keeps
  WAHA on internal port `3000`, authenticates the healthcheck with the mounted
  key, and persists `/app/.sessions` on `waha-sessions`.
- The wrapper rejects unreadable or blank secrets with exit `78`, passes
  `WAHA_API_KEY` only to native WAHA startup, unsets the file-path variable, and
  preserves the native `tini` process chain.

## Exact redacted receipts

```text
docker pull devlikeapro/waha:latest-2026.8.1
PASS; resolved digest sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca

docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha config
PASS; merged configuration contains internal API/WAHA ports, the mounted secret path,
the repository entrypoint, and no resolved WAHA key value

docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha up --build --wait -d
PASS; PostgreSQL, WAHA, API, and web became healthy; web root and proxied health returned 200

docker compose -p <disposable-project> -f docker-compose.yml \
  -f docker-compose.override.yml -f docker-compose.bundled-waha.yml \
  --profile waha down --remove-orphans
PASS; disposable project cleaned without removing unrelated resources

npx --yes pnpm@10.12.4 exec vitest run --pool=forks --maxWorkers=1 --minWorkers=1
PASS; fresh migrated PostgreSQL matrix: 67 files, 322 tests, 0 failed, 0 skipped

npx --yes pnpm@10.12.4 test:e2e
PASS; 20 passed, 0 failed, 0 skipped
```

Additional checks passed: focused Compose tests `10/10`, typecheck, ordered
production build, changed-file Biome, `git diff --check`, and `docs:check`.

## Limits

This receipt proves the repository-owned bundled startup, secret boundary,
internal networking, authenticated service health, and disposable cleanup. It
does not prove WhatsApp account linking, account safety, recipient delivery,
real-provider behavior, or completion of protected plan checkboxes and final
release gates. Full repository lint remains non-clean because the configured
Biome command traverses host paths and reports workstation diagnostics plus a
pre-existing analytics fixture formatting issue.
