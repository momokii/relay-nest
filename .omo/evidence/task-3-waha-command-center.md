# Todo 3 evidence — typed workspace and Compose skeleton

Date: 2026-08-16

## Baseline

- `package.json`: absent before changes.
- `pnpm-workspace.yaml`: absent before changes.
- `pnpm`: unavailable as a direct command; setup-equivalent used: `npx --yes pnpm@10.12.4`.
- Docker Compose: available, v5.1.1.
- Existing docs validator: PASS — `python3 scripts/check_waha_capability_matrix.py docs/waha-capability-matrix.md`.

## Test-first record

1. Added `tests/workspace-smoke.test.ts` before the shared config existed.
2. Red: `npx --yes vitest@3.2.4 run tests/workspace-smoke.test.ts` failed with `Cannot find module '../packages/config/src/index'`.
3. Green: final `pnpm test` equivalent passed with 1 test.

## Changed scaffold

- Root pnpm workspace, exact Node.js LTS/pnpm assumptions, lockfile, strict TypeScript project references, Biome 2, Vitest, and Playwright.
- `apps/api`: Fastify shell, Zod boundary parsing, Drizzle Kit migration hooks.
- `apps/web`: React/Vite shell.
- `packages/domain`, `packages/config`, `packages/waha-contracts`: narrow shared typed contracts.
- Pinned non-latest images: Node `22.23.1-alpine`, PostgreSQL `17.6-alpine`, and WAHA `devlikeapro/waha:2026.8.1`.
- `docker-compose.yml` base/external-runtime mode, `docker-compose.external-waha.yml`, and `docker-compose.bundled-waha.yml`; bundled WAHA uses the `waha` profile and has no host port.
- `.env.example`, `.dockerignore`, generated-artifact ignores, and the Todo 3 dependency/security decision entry.

## Verification

All commands below exited 0 unless noted:

- `npx --yes pnpm@10.12.4 install --frozen-lockfile` — PASS.
- `npx --yes pnpm@10.12.4 lint` — PASS.
- `npx --yes pnpm@10.12.4 typecheck` — PASS.
- `npx --yes pnpm@10.12.4 test` — PASS, 1 Vitest test.
- `npx --yes pnpm@10.12.4 test:e2e` — PASS, 1 Playwright harness test.
- `npx --yes pnpm@10.12.4 build` — PASS, API and web builds.
- `docker compose config` — PASS.
- `docker compose --profile waha config` — PASS; rendered WAHA image is pinned and no WAHA host port is published.
- `WAHA_BASE_URL=https://waha.example.invalid docker compose -f docker-compose.yml -f docker-compose.external-waha.yml config` — PASS.
- `docker compose -f docker-compose.yml -f docker-compose.bundled-waha.yml --profile waha config` — PASS.
- `npx --yes pnpm@10.12.4 audit --audit-level=high` — PASS, no known vulnerabilities after the `esbuild@0.25.12` override.

## Adversarial probes

- `malformed_input`: `WAHA_BASE_URL=not-a-url ... pnpm test` failed as expected with Zod `Invalid url`; normal configuration remained green.
- `stale_state`: lockfile exists, WAHA image is `2026.8.1`, and no production `latest` image tag was found — PASS.
- `dirty_worktree`: existing docs and prior evidence were preserved; only the new Todo 3 evidence file was added under `.omo/evidence`.
- `generated_artifact`: build output, TypeScript build metadata, Playwright results, and temporary Compose outputs were removed; ignore rules now cover them.
- `long_command`: dependency commands were bounded to 300 seconds; verification commands were bounded to 120–240 seconds.
- `misleading_success_output`: Compose assertions inspected rendered config and confirmed bundled WAHA has no `ports` block.
- `prompt_injection`, `cancel_resume`, `flaky_test`, `repeated_interruptions`: not triggered; no external prompt or interruption occurred, and the deterministic smoke tests passed without retries.

## LSP and cleanup receipt

- LSP diagnostics were attempted for every modified TypeScript source/test file; the diagnostics MCP connection closed before returning results. Equivalent strict `tsc -b`, Biome, Vitest, Playwright, and production build gates passed.
- Cleanup completed: removed `dist/`, `*.tsbuildinfo`, `test-results/`, `playwright-report/`, and temporary `/tmp/waha-*` Compose/audit probe files. No `.env` or secret file was created.
