# RelayNest

RelayNest is an in-progress, self-hosted WhatsApp command center built around
WAHA. It serves one tenant, multiple authenticated users, and multiple linked
sessions with hard-separated Personal and Business account scopes.

## Scope

Implemented work currently covers original Todos 1-14: product/domain decisions, the
typed Node.js/TypeScript foundation, authentication and roles, per-session
grants, server-side WAHA integration, session lifecycle, one-time durable text
scheduling, contact resolution, webhook ingestion, delivery evidence, and
SMTP/Telegram notifications.

Todo 12 is implemented and synchronized in semantic commits: scoped retention metadata,
preview- and confirmation-gated purge, immutable content-free purge
accountability, authenticated AES-256-GCM backup/restore, and offline
key-rotation guidance, authenticated envelope metadata, bounded relational
backup transfer, scope-aware restore validation, session safety backup coverage,
and WAHA configuration audit events. Its focused verification and concurrency
regression fix are recorded in `.omo/evidence/task-12-waha-command-center.md`;
the whole-plan final gates are still pending.

The MVP excludes multi-tenant SaaS, public registration, media, recurring
schedules, campaigns, broadcasts, full inbox parity, autonomous AI sending,
scraping, spam, stealth, anti-detection, and ban evasion. AI suggestions always
require human approval.

WAHA uses an unofficial reverse-engineered WhatsApp client. Restriction or ban
risk is inherent and must be treated as an operational blocker, not an edge case.
Consent, pacing, budgets, quiet hours, duplicate/burst protection,
cooldowns, timelock, capping, and approval gates reduce risk but cannot guarantee account safety or recipient delivery.

## Architecture and security

The repository is a pnpm TypeScript workspace with a Fastify API, React/Vite
web app, PostgreSQL/Drizzle persistence, Zod boundary validation, Biome,
Vitest, Playwright, and Docker Compose. WAHA credentials stay server-side;
bundled WAHA stays on the internal Compose network and is not published.
Personal and Business scopes are enforced server-side in authorization,
queries, retention, backups, analytics, and audit records. HTTP acceptance or
WAHA `WORKING` status is not recipient-delivery proof.

The repository defines dashboard-only external-WAHA and bundled-WAHA Compose
configurations (`docker-compose.external-waha.yml`,
`docker-compose.bundled-waha.yml`, and `docker-compose.yml`). External mode
connects to an operator-approved provider; bundled mode builds the published,
digest-pinned `latest-2026.8.1` image and injects its API key through a mounted
Docker secret and repository-owned wrapper. Both keep WAHA internal. Public
deployment requires reverse-proxy HTTPS/TLS, firewall restrictions, hardened
cookies and headers, rate limiting, and an explicit threat-model review.

## Docker deployment

Docker Compose is the supported deployment path. Install Docker Engine with
Compose v2, clone this repository, and run all commands from its root. The
deployment publishes only the dashboard on `WEB_BIND_ADDRESS` and `WEB_PORT`
(`127.0.0.1:8080` by default); the API, PostgreSQL, and bundled WAHA remain on
the private Compose network. Keep the default for local or reverse-proxy use;
set `WEB_BIND_ADDRESS` to an explicit trusted LAN/VPN address only when needed.

### One-click bundled deployment

This mode runs PostgreSQL, RelayNest, and the digest-pinned WAHA image locally.
Create the three required secret files once, then start the named production
Compose project:

```bash
umask 077
mkdir -p .secrets
chmod 700 .secrets
openssl rand -hex 24 > .secrets/postgres_password
openssl rand -base64 32 > .secrets/encryption_master_key
openssl rand -hex 24 > .secrets/waha_api_key
export ENCRYPTION_MASTER_KEY_FILE="$PWD/.secrets/encryption_master_key"
export WAHA_API_KEY_FILE="$PWD/.secrets/waha_api_key"
npx --yes pnpm@10.12.4 deploy:bundled
```

Open `http://localhost:8080` (or the configured `WEB_BIND_ADDRESS` and
`WEB_PORT`), choose
**Create the first Admin**, and complete bootstrap. The WAHA API key generated
above is for the bundled service; it is not a WhatsApp account credential. Link
a session only after reviewing the consent, pacing, quiet-hour, and account-risk
controls.

### One-click external-WAHA deployment

Use this mode when WAHA is operated separately. Create the PostgreSQL and
encryption secret files as above, set an operator-approved WAHA URL reachable
from the API container, and start the external overlay:

```bash
export ENCRYPTION_MASTER_KEY_FILE="$PWD/.secrets/encryption_master_key"
export WAHA_BASE_URL="https://waha.internal.example"
npx --yes pnpm@10.12.4 deploy:external
```

The external WAHA service is not created by this repository. Its connection name
and API key are configured by an Admin in RelayNest and stored encrypted; do not
put provider keys in `.env`, Compose YAML, browser storage, or logs.

### Operate the deployment

```bash
# Show service state and health
docker compose -p relaynest ps

# Follow application logs without printing secret files
docker compose -p relaynest logs -f api web

# Stop the RelayNest project without deleting named data volumes
npx --yes pnpm@10.12.4 deploy:down

# Start a bundled deployment again using the same secret exports
npx --yes pnpm@10.12.4 deploy:bundled

# Or start an external-WAHA deployment again with WAHA_BASE_URL exported
npx --yes pnpm@10.12.4 deploy:external
```

Named volumes preserve PostgreSQL data and bundled WAHA session state. Back up
both through the procedures in `docs/operations.md`; never use `docker system
prune` or `down --volumes` against a retained deployment. For updates, review
the image and application changes, recreate the stack with the same deployment
command, and verify `docker compose -p relaynest ps` before exposing it to users.

## Fast development

Use the pinned Node/pnpm toolchain and lockfile. Copy `.env.example`, then for
the quickest local app test provision disposable development secrets once:

```bash
umask 077
mkdir -p .secrets
chmod 700 .secrets
printf 'local-postgres-password\n' > .secrets/postgres_password
openssl rand -base64 32 > .secrets/encryption_master_key
printf 'local-waha-api-key\n' > .secrets/waha_api_key
chmod 600 .secrets/*
export ENCRYPTION_MASTER_KEY_FILE=./.secrets/encryption_master_key
export WAHA_API_KEY_FILE=./.secrets/waha_api_key
npx --yes pnpm@10.12.4 dev:bundled
```

Open `http://localhost:8080` (or the port configured by `WEB_PORT`). Stop only this
disposable stack with:

```bash
docker compose -p relaynest-dev \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha down --remove-orphans
```

For each feature, add a focused regression test and run only the fast verifier:

```bash
npx --yes pnpm@10.12.4 feature \
  --test-file tests/<regression>.test.ts \
  --test-name "<focused behavior>" \
  --paths <changed-source> <regression-test>
```

This runs focused Vitest, typecheck, and scoped Biome. The full release path is
explicit and should be run only when requested:

```bash
npx --yes pnpm@10.12.4 release
```

The exact Compose commands, secret precedence, health semantics, persistence,
backup, and cleanup procedures are in `docs/operations.md`. Never expose real
secrets in source, fixtures, logs, browser storage, or evidence.

Release checks (explicit):

```text
npx --yes pnpm@10.12.4 lint
npx --yes pnpm@10.12.4 typecheck
npx --yes pnpm@10.12.4 test
npx --yes pnpm@10.12.4 test:e2e
npx --yes pnpm@10.12.4 audit --audit-level=high
npx --yes pnpm@10.12.4 run docs:check
```

Todo 10 evidence includes the isolated release matrix and exact redacted
commands/results; Todo 12 evidence includes migration replay, repository and HTTP integration,
scope isolation, stale-preview and wrong-key rejection, tamper/cross-scope
backup rejection, redaction, manual backup/restore QA, and disposable-resource
cleanup. Focused evidence is not completion of the remaining plan. The current
`main` branch is synchronized with `origin/main`; final gates remain pending.

## Source of truth

- `CONTEXT.md` — domain language.
- `.claude/README.md` and `.claude/state/` — agent orientation and live state.
- `docs/decisions/0001-product-boundary.md` — product boundary.
- `docs/threat-model.md` — security controls and residual risks.
- `docs/waha-capability-matrix.md` — WAHA contract.
- `docs/operations.md` — operations, purge, backup, and recovery.
- `.omo/evidence/` — task verification artifacts.
- `.omo/plans/waha-command-center.md` — protected approved-scope plan.

The plan and `.omo/start-work/ledger.jsonl` are protected records. Do not edit
them during ordinary implementation or documentation work.

## Deferred limitations

Original Todos 15-16 and final F1-F4 plan, security, executable QA, and
scope/document gates remain open. Next-phases Todo 8 and Todo 15 have a
runtime-verified implementation, while their protected plan checkboxes and
release reconciliation remain open. Backup expiry is a separate lifecycle from
live purge, and public-internet deployment is not the default supported
exposure.
