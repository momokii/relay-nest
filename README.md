# RelayNest

RelayNest is an in-progress, self-hosted WhatsApp command center built around
WAHA. It serves one tenant, multiple authenticated users, and multiple linked
sessions with hard-separated Personal and Business account scopes.

## Scope

Implemented work currently covers Todos 1-12: product/domain decisions, the
typed Node.js/TypeScript foundation, authentication and roles, per-session
grants, server-side WAHA integration, session lifecycle, one-time durable text
scheduling, contact resolution, webhook ingestion, delivery evidence, and
SMTP/Telegram notifications.

Todo 12 is committed locally in eight implementation/state commits: scoped retention metadata,
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
risk is inherent; consent, pacing, budgets, quiet hours, duplicate/burst
protection, cooldowns, timelock, capping, and approval gates cannot guarantee
account safety.

## Architecture and security

The repository is a pnpm TypeScript workspace with a Fastify API, React/Vite
web app, PostgreSQL/Drizzle persistence, Zod boundary validation, Biome,
Vitest, Playwright, and Docker Compose. WAHA credentials stay server-side;
bundled WAHA stays on the internal Compose network and is not published.
Personal and Business scopes are enforced server-side in authorization,
queries, retention, backups, analytics, and audit records. HTTP acceptance or
WAHA `WORKING` status is not recipient-delivery proof.

Supported deployment modes are dashboard-only with an external WAHA service and
bundled WAHA (`docker-compose.external-waha.yml`,
`docker-compose.bundled-waha.yml`, and `docker-compose.yml`). Public deployment
requires reverse-proxy HTTPS/TLS, firewall restrictions, hardened cookies and
headers, rate limiting, and an explicit threat-model review.

## Setup and verification

Use the pinned Node/pnpm toolchain and lockfile. Copy `.env.example`, provide
local secrets, and choose a Compose mode. Do not expose real secrets in source,
fixtures, logs, browser storage, or evidence.

Common checks:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm audit --audit-level=high
docker compose config
```

Todo 12 evidence includes migration replay, repository and HTTP integration,
scope isolation, stale-preview and wrong-key rejection, tamper/cross-scope
backup rejection, redaction, manual backup/restore QA, and disposable-resource
cleanup. Focused evidence is not completion of the remaining plan. The local
commits remain pending final branch synchronization.

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

Todos 13-16 and final F1-F4 plan, security, executable QA, and scope/document
gates remain open. Backup expiry is a separate lifecycle from live purge, and
public-internet deployment is not the default supported exposure.
