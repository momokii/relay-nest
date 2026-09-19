# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-20

First stable release of RelayNest (WAHA Command Center). All Todos 1-16 and final gates F1-F4 verified against disposable PostgreSQL and mocked WAHA with redacted evidence.

### Added

- **Domain and product boundary** — single-tenant, multi-user, multi-session model with hard Personal/Business scope separation, Admin/Operator/Viewer roles, per-session grants, and threat model covering dashboard exposure, credential handling, webhook spoofing, duplicate sends, and cross-scope access. Decision record `docs/decisions/0001-product-boundary.md`, glossary `CONTEXT.md`, and pinned WAHA capability matrix `docs/waha-capability-matrix.md` for OpenAPI 2026.8.1.
- **Typed workspace foundation** — pnpm workspace (`apps/api`, `apps/web`, `packages/domain`, `packages/config`, `packages/waha-contracts`) with Node `>=22.23.1 <23`, TypeScript strict, Fastify, React/Vite, PostgreSQL/Drizzle, Zod boundaries, Biome, Vitest, and Playwright.
- **Authentication and authorization** — Admin bootstrap (now with password confirmation), Admin-created users, secure cookie sessions, per-session/per-scope grants, deny-by-default enforcement on every query. Viewer is read-only; ungranted cross-scope access returns safe denial.
- **Users and access lifecycle** — create, grant, reset password (minimum 12 characters), disable and re-enable with portaled row menus, role/status filters, totals, and full-width admin tables. Disabling revokes grants and blocks sign-in; re-enabling restores sign-in but grants stay revoked.
- **Server-side WAHA integration** — typed adapter with capability negotiation, server-side API-key handling, timeout/cancellation, redacted errors, health/version/environment checks, and Admin-only runtime WAHA connection settings. Bundled WAHA stays internal; external mode targets an operator-approved `WAHA_BASE_URL`.
- **Session lifecycle parity** — list/status/metadata, start/stop/restart/logout/delete, QR/pairing-code/passkey discovery, `/me`, status history, timelock and capping visibility, session-name validation, and 30s budgets for QR/pairing-code requests.
- **Webhook ingestion** — HMAC/timestamp-validated, idempotent, deduplicated storage of redacted normalized events; tolerates retries and out-of-order delivery; updates session and message acknowledgment state.
- **Durable one-time scheduler** — PostgreSQL transactional claiming with leases, explicit stored timezone, combined schedule history (scoped detail, cancel, delete-by-state), states `scheduled`, `attempting`, `submitted`, `acknowledged`, `failed`, `unknown`, `cancelled` (plus `queued`), bounded exponential retry, idempotency keys, restart recovery via background ticker, and gating on consent, timelock/capping, budgets, quiet hours, and session health.
- **Messaging and contacts** — WAHA contact lookup/search, normalized and validated manual phone entry, existing-chat selection, immediate and scheduled one-time text sends with audit/attempt records, composer formatting toolbar, explicit timezone persistence, timezone-aware rendering, search/filters/pagination, and reference tracking in sent history.
- **Combined schedule history UX** — truncated message column with explicit Show more/Show less inline expansion, WhatsApp formatting (bold, italic, code) rendered in the history table, detail modal with full content, `aria-modal` and focus-trap behavior, and pagination with edge-disabled controls.
- **Settings and session workspace** — full-width Settings control center with scoped inventory and Admin-only WAHA connection panel; Sessions/Overview scoped status; Users header clarifies disable lifecycle.
- **Analytics and delivery evidence** — scoped projections for volume, direction, acknowledgment breakdown, failure/retry rates, session uptime/status history, timelock/capping indicators, contact activity, and scheduled-job outcomes with mandatory scope filters.
- **Notifications** — independently enabled SMTP and Telegram channels, encrypted Admin-only settings with masked secrets, category toggles, test sends, retry/backoff, and redacted in-app failure history.
- **Retention, audit, and encrypted backup** — per-category retention policies (policy change does not delete), preview/count before delete, explicit confirmation-gated purge, immutable content-free purge audit records, scope-aware retention and audit coverage for sends/session/config/user changes, authenticated AES-256-GCM backup/restore with envelope version 2, snapshot-consistent `REPEATABLE READ` export, allowlisted descriptors, UUID keyset paging, 10k-row/8 MiB bounded relational transfer in 250-row transactions, and offline key-rotation guidance.
- **Campaign extra-MVP** — scoped contact-group and reaction-triggered campaign surfaces (`/scoped/contact-groups`, `/scoped/campaigns`) with deduped 1:1 follow-up on `message.reaction` (`campaign:{id}:reaction:{participant}:{messageId}`), WAHA group provisioning and participant management; APIs are scoped and grant-checked while the dashboard Campaigns entry remains disabled and flagged UNSTABLE.
- **Docker deployment and operations** — dashboard-only external-WAHA and bundled-WAHA Compose modes (`docker-compose.yml`, `.override.yml`, `.external-waha.yml`, `.bundled-waha.yml`), `Dockerfile.waha` digest-pinned to `latest-2026.8.1`, repository-owned bundled wrapper that injects the API key via mounted Docker secret, four-container runtime `postgres`/`api`/`web`/`waha` (optional), web as the only published service (`127.0.0.1:8080`, `relaynest-dev` on `8081`), healthcheck chaining, non-root containers, secret-file injection (`ENCRYPTION_MASTER_KEY_FILE`, `WAHA_API_KEY_FILE`), migration-before-listen startup, and one-click `scripts/setup.sh` (`setup:bundled`, `setup:external`, `setup:dev`).
- **Release tooling and evidence** — `pnpm feature` focused verifier, `pnpm release` aggregate gate, `verify:requirements`, `secret-scan`, `verify:scope`, `docs:check`, and `.omo/evidence/` gate records (`task-15-*`, `task-16-*`, `final-*.md`).

### Changed

- Setup and operations documentation rewritten end-to-end with exact Compose invocations, secret precedence, health/readiness, persistence, backup/restore, and cleanup procedures; README now declares single source of version in root `package.json`.
- Dashboard layout rhythm and spacing refined for campaign and app surfaces; composer preview parity tightened with over-limit rejection.
- Compose port exposure narrowed — API exposes `3000` internally only; only `web` publishes a host port (loopback).

### Fixed

- **Self-disable block** — Admin cannot disable their own account.
- **WhatsApp preview** — message preview and composer preview render consistently; schedule history shows formatted WhatsApp text in the message column rather than raw content.
- **Inline expand** — long messages truncate with an explicit Show more/Show less control instead of clipping.
- **Focus-trap** — schedule detail modal and delete-confirm dialogs trap focus and set initial focus; history overlay no longer leaves focus unmanaged.
- Scheduler background ticker ensures due jobs actually dispatch; timezone wall times are interpreted in the submitted timezone and rendered in the persisted timezone; duplicate and double-submit sends are deduplicated via idempotency keys.
- Users row-action menus no longer clip; session scope switching no longer retains a stale prior-scope ID; contact-group scoping and participant handling corrected.

### Security

- Application-level AES-256-GCM envelope encryption for message content, contacts, notification secrets, WAHA credentials, and AI data; blind indexes only where exact lookup is required; tampered-ciphertext and wrong-key paths fail closed.
- WAHA credentials and encryption master key stay server-side, loaded from Docker secret files; never visible in browser, logs, or resolved Compose output; Compose config scans assert zero secret values.
- CSRF/same-origin enforcement on state-changing routes (including retention preview, backup, and schedule detail), rate-limited auth failures, redacted error responses and logs, immutable content-free audit trail, and fail-closed backup validation (rejection of tampered, cross-scope, and version 1 envelopes).

[1.0.0]: https://github.com/momokii/relay-nest/releases/tag/v1.0.0
[Unreleased]: https://github.com/momokii/relay-nest/compare/v1.0.0...HEAD
