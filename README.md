# RelayNest

RelayNest is an in-progress, self-hosted WhatsApp command center built around
WAHA. It serves one tenant, multiple authenticated users, and multiple linked
sessions with hard-separated Personal and Business account scopes.

## What RelayNest does, end to end

One operator's full journey looks like this: an Admin creates user accounts,
links one or more WhatsApp sessions through WAHA, grants each user access to
exactly the sessions they may operate, and from then on everybody works inside
the dashboard — sending and scheduling one-time text messages, watching
delivery evidence, and managing retention, notifications, and access, all
without touching a server shell.

**Roles and scopes.** Every user has one product-level role — Admin, Operator,
or Viewer — and every piece of data belongs to either the Personal or the
Business scope; the two scopes are never interchangeable. A role alone grants
nothing: a user can only operate a session after an Admin records an explicit
per-session, per-scope grant for them. A user with no roles and no grants can
sign in but sees no sessions and cannot send, schedule, or open Admin controls.
There is no public registration; all accounts are Admin-created.

**Daily surfaces.** The left sidebar walks the workflow in order: Overview
(scoped status), Sessions (link and control WAHA sessions), Contacts (resolve
one consent-aware recipient), Send (immediate text), Schedule (one-time text
with explicit timezone), Campaigns (under development), Analytics (scoped
delivery projections), Notifications (SMTP/Telegram failure paths), Retention
(policy preview and confirmation-gated purge), Users (create, grant, reset
password, disable and re-enable), and Settings (workspace inventory and the
admin-only WAHA connection panel).

**Rules that never bend.** Disabling a user revokes all their sessions and
blocks sign-in; re-enabling restores sign-in but prior grants stay revoked and
must be re-granted. Grant revocation is not available yet. HTTP acceptance or
WAHA `WORKING` status is not recipient-delivery proof — the app tracks
`scheduled`, `attempting`, `submitted`, `acknowledged`, `failed`, `unknown`,
and `cancelled` as distinct states. AI suggestions always require human
approval before any send.

## Scope

Implemented work currently covers original Todos 1-16: product/domain decisions, the
typed Node.js/TypeScript foundation, authentication and roles, per-session
grants, server-side WAHA integration, session lifecycle, one-time durable text
scheduling with a combined schedule history (scoped detail, cancel, and
delete-by-state controls), contact resolution, webhook ingestion, delivery
evidence, SMTP/Telegram notifications, scoped retention with preview- and
confirmation-gated purge, authenticated AES-256-GCM backup/restore, WAHA
configuration audit events, and the Users/Settings lifecycle (reversible
disable with enable, portaled row menus, full-width admin panels). The
verification records for the release sweep live in `.omo/evidence/`
(`task-15-*`, `task-16-*`, and the `final-*.md` gate records).

Todo 12 is implemented and synchronized in semantic commits: scoped retention metadata,
preview- and confirmation-gated purge, immutable content-free purge
accountability, authenticated AES-256-GCM backup/restore, and offline
key-rotation guidance, authenticated envelope metadata, bounded relational
backup transfer, scope-aware restore validation, session safety backup coverage,
and WAHA configuration audit events. Its focused verification and concurrency
regression fix are recorded in `.omo/evidence/task-12-waha-command-center.md`.

The MVP excludes multi-tenant SaaS, public registration, media, recurring
schedules, campaigns, broadcasts, full inbox parity, autonomous AI sending,
scraping, spam, stealth, anti-detection, and ban evasion. AI suggestions always
require human approval.

WAHA uses an unofficial reverse-engineered WhatsApp client.
Restriction or ban risk is inherent and must be treated as an operational
blocker, not an edge case. RelayNest's mitigations are consent-first sending,
send pacing, per-session budgets, quiet hours, duplicate/burst protection,
newly-linked cooldowns, timelock/capping signals, and human approval of every
dispatch. These reduce risk but cannot guarantee account safety or recipient
delivery.

## Architecture and security

The repository is a pnpm TypeScript workspace with a Fastify API, React/Vite
web app, PostgreSQL/Drizzle persistence, Zod boundary validation, Biome,
Vitest, Playwright, and Docker Compose. WAHA credentials stay server-side;
bundled WAHA stays on the internal Compose network and is not published.
Personal and Business scopes are enforced server-side in authorization,
queries, retention, backups, analytics, and audit records. HTTP acceptance or
WAHA `WORKING` status is not recipient-delivery proof.

Four containers form the runtime: `postgres` (durable state), `api`
(authenticated JSON on internal port 3000), `web` (the only published
service, the dashboard), and optionally `waha` (WhatsApp transport on
internal port 3000). The API applies database migrations at startup, then
listens; healthchecks chain `postgres` → `waha` (bundled only) → `api` →
`web`, so dependents only start once their dependency reports healthy.

The repository defines dashboard-only external-WAHA and bundled-WAHA Compose
configurations (`docker-compose.external-waha.yml`,
`docker-compose.bundled-waha.yml`, and `docker-compose.yml`). External mode
connects to an operator-approved provider; bundled mode builds the published,
digest-pinned `latest-2026.8.1` image and injects its API key through a mounted
Docker secret and repository-owned wrapper. Both keep WAHA internal. Public
deployment requires reverse-proxy HTTPS/TLS, firewall restrictions, hardened
cookies and headers, rate limiting, and an explicit threat-model review.

## WAHA connection modes: bundled vs external

There are exactly two supported ways to connect WhatsApp transport. Pick one
per deployment; the app behaves identically afterward.

```text
Bundled:  postgres + api + web + waha (built from Dockerfile.waha, profile "waha")
External: postgres + api + web, talking to a WAHA you already operate
```

Use bundled when you want everything on one host: the Compose stack builds and
starts its own WAHA service on the internal network (`http://waha:3000`),
creates the `waha-sessions` volume for session state, and healthchecks WAHA
with the same API key file the API uses. Use external when your organization
already runs WAHA elsewhere: the stack starts only `postgres`, `api`, and
`web`, and the API talks to the URL you approve via `WAHA_BASE_URL`. In both
modes the WAHA API key is AES-256-GCM encrypted at rest, loaded from a Docker
secret file, and never visible in the browser, logs, or resolved Compose
output.

## Docker deployment

Docker Compose is the supported deployment path. Install Docker Engine with
Compose v2, clone this repository, and run all commands from its root. The
deployment publishes only the dashboard on `WEB_BIND_ADDRESS` and `WEB_PORT`
(`127.0.0.1:8080` by default); the API, PostgreSQL, and bundled WAHA remain on
the private Compose network. Keep the default for local or reverse-proxy use;
set `WEB_BIND_ADDRESS` to an explicit trusted LAN/VPN address only when needed.

### Step 0 — secrets (both modes)

Create the secret files once. Bundled deployments need all three; external
deployments need the first two plus `WAHA_BASE_URL`.

```bash
umask 077
mkdir -p .secrets
chmod 700 .secrets
openssl rand -hex 24 > .secrets/postgres_password
openssl rand -base64 32 > .secrets/encryption_master_key
openssl rand -hex 24 > .secrets/waha_api_key
chmod 600 .secrets/*
export ENCRYPTION_MASTER_KEY_FILE="$PWD/.secrets/encryption_master_key"
export WAHA_API_KEY_FILE="$PWD/.secrets/waha_api_key"
```

The base Compose file requires `ENCRYPTION_MASTER_KEY_FILE` (fail-closed when
missing); the bundled overlay additionally requires `WAHA_API_KEY_FILE`. Never
put key material in `.env`, Compose YAML, browser storage, logs, or evidence —
only file paths travel through environment variables. Repeat both exports in
every new shell before running any Compose command below.

### Setup A — one-click bundled deployment

This mode runs PostgreSQL, RelayNest, and the digest-pinned WAHA image locally:

```bash
npx --yes pnpm@10.12.4 deploy:bundled
```

Open `http://localhost:8080` (or the configured `WEB_BIND_ADDRESS` and
`WEB_PORT`), choose
**Create the first Admin**, and complete bootstrap. The WAHA API key generated
above is for the bundled service; it is not a WhatsApp account credential. Link
a session only after reviewing the consent, pacing, quiet-hour, and account-risk
controls.

### Setup B — one-click external-WAHA deployment

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

### First run after either setup

1. Open the dashboard and choose **Create the first Admin** (bootstrap works
   only while no users exist; afterwards it refuses).
2. As Admin, go to Sessions and link a session (QR, pairing code, or passkey),
   then open Users, create an Operator, and grant them that session.
3. As the Operator, open Contacts, resolve one consenting recipient, then Send
   one immediate text and Schedule one future text.
4. Open Schedule history to watch the states move (`scheduled` → `attempting`
   → `submitted`/`acknowledged`), and Settings to confirm inventory.

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

### Troubleshooting

```text
"Set ENCRYPTION_MASTER_KEY_FILE to a secret file" -> export the variable (Step 0)
  before every compose command; each new shell needs the export again.
"Set WAHA_API_KEY_FILE to a secret file" -> bundled mode only; export it too.
"port is already allocated" -> another stack owns the port; check
  docker compose -p relaynest-dev ps for the dev project on 8081.
"waha ... unhealthy" -> bundled WAHA did not pass its X-Api-Key loopback check;
  confirm .secrets/waha_api_key is non-empty and readable (mode 600).
API 401/timeout against external WAHA -> confirm WAHA_BASE_URL is reachable from
  inside the api container and the stored connection key is current.
Login fails after restore -> the key differs; restore needs the same
  encryption master key, per docs/operations.md.
```

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
export WEB_PORT=8081
npx --yes pnpm@10.12.4 dev:bundled
```

The dev stack uses project name `relaynest-dev`, so it gets its own volumes
and never touches production data; `WEB_PORT=8081` keeps it off the default
`8080` when both stacks run side by side.

Open `http://localhost:8081` (or the port configured by `WEB_PORT`). Stop only this
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
`main` branch is synchronized with `origin/main`; the release gate records live
in `.omo/evidence/final-*.md`.

## License

RelayNest is licensed under the Apache License, Version 2.0. See `LICENSE`
for the full text. Contributions are accepted under the same license.

## Source of truth

- `CONTEXT.md` — domain language.
- `.claude/README.md` and `.claude/state/` — agent orientation and live state.
- `docs/decisions/0001-product-boundary.md` — product boundary.
- `docs/threat-model.md` — security controls and residual risks.
- `docs/waha-capability-matrix.md` — WAHA contract.
- `docs/operations.md` — operations, purge, backup, and recovery.
- `DESIGN.md` — design system for the dashboard UI.
- `.omo/evidence/` — task verification artifacts.
- `.omo/plans/waha-command-center.md` — protected approved-scope plan.

The plan and `.omo/start-work/ledger.jsonl` are protected records. Do not edit
them during ordinary implementation or documentation work.

## Deferred limitations

The release gate records live in `.omo/evidence/` (`task-15-*`, `task-16-*`,
and `final-*.md`). Next-phases Todo 8 and Todo 15 have a
runtime-verified implementation, while their protected plan checkboxes and
release reconciliation remain open. Backup expiry is a separate lifecycle from
live purge, and public-internet deployment is not the default supported
exposure.
