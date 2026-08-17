# Decisions Log

This file is the permanent record of significant architectural, technical,
product, security, and operational decisions. Add an entry when a choice affects
future work, dependencies, data, interfaces, deployment, or risk. Do not use this
file as a general progress journal; progress belongs in `CURRENT_STATUS.md`.

## Current Decisions

### Decision: Pinned PostgreSQL driver for Drizzle migrations

**Date:** 2026-08-16

Todo 4's Drizzle migration command requires a PostgreSQL driver at runtime. The
workspace uses `postgres@3.4.7`, the existing ESM-compatible driver, rather than
introducing a second ORM or custom migration path. It receives the existing
`DATABASE_URL`; credentials are not logged or persisted by application code.

### Decision: Todo 3 typed workspace and pinned deployment scaffold

**Date:** 2026-08-16

Use pnpm 10.12.4 with Node.js 22.23.1, strict TypeScript, Fastify, React/Vite,
Zod, Drizzle, Biome, Vitest, and Playwright. Pin dependency versions and the
audited `devlikeapro/waha:2026.8.1` image. Keep WAHA internal in Compose;
external-WAHA mode supplies its URL at runtime. PostgreSQL credentials use an
external Compose secret and app containers run as the non-root `node` user.

### Decision: Locked WAHA Command Center product decisions

**Date:** 2026-08-16

The product is one self-hosted tenant with multiple users and WAHA sessions,
hard-separated Personal and Business scopes, Admin-created users, explicit
per-session grants, Admin-only dangerous operations, internal bundled WAHA, and
one-time application-owned scheduling with retries, idempotency, leases, and
recovery states. Retention requires preview and confirmation; audit records are
content-free and immutable; notifications are independently enabled; AI is
provider-agnostic suggestion/draft assistance requiring human approval. Media,
recurring schedules, campaigns, broadcasts, autonomous sending, scraping, spam,
stealth, anti-detection, and ban evasion remain outside the MVP.

Durable references: `CONTEXT.md`, `docs/decisions/0001-product-boundary.md`,
and `docs/threat-model.md`.

### Decision: Single-tenant, multi-user, multi-session product boundary

**Date:** 2026-08-16

A single self-hosted tenant avoids premature SaaS complexity while
Admin/Operator/Viewer roles and per-session grants support practical use.
Authorization is server-side and session-scoped; there is no public
registration; every query, audit event, analytics projection, AI context,
retention operation, export, and UI filter carries account/session scope.

### Decision: Application-owned durable scheduling

**Date:** 2026-08-16

PostgreSQL-backed one-time jobs provide restart recovery, explicit timezones,
bounded retries, idempotency, cancellation, and auditable outcomes because WAHA
does not expose a general delayed-send resource. Timelock, capping, session, and
consent gates run before dispatch; retries must not duplicate-send.

### Decision: Dashboard exposure with internal WAHA

**Date:** 2026-08-16

Bind the dashboard to `0.0.0.0` for LAN/VPN convenience, keep bundled WAHA
internal and unpublished, and require reverse-proxy TLS/firewall hardening for
public deployment. Authentication, secure cookies, CSRF protection, login rate
limits, server-side keys, and explicit exposure warnings are mandatory.

## Decision Entry Template

Copy this template for each significant decision and fill every field:

---
**Decision:** What was decided
**Date:** YYYY-MM-DD
**Context:** Why this decision was needed
**Rationale:** Why this option was chosen
**Alternatives Rejected:** Other options considered and why they were not chosen
**Security Implications:** Security impact, mitigations, and verification performed
**Impact:** What this decision affects downstream
---

## Todo 12: scoped retention and authenticated backups

**Date:** 2026-08-17
**Status:** Implemented and focused-verified in the worktree; final matrix and
commit remain pending.

Retention policy changes are metadata-only. Purge requires a scope-bound,
bounded preview, an expiring server-issued token, matching cutoff/count/category
and scope, and explicit confirmation. Purge leaves immutable, content-free
audit accountability; it never purges audit records. Backup/restore uses
authenticated AES-256-GCM envelopes with scope-bound metadata and includes
encrypted notification settings. Missing, wrong, malformed, tampered, or
cross-scope keys/data fail closed. Backup expiry is a separate lifecycle.

Key rotation is an offline re-encryption migration followed by isolated restore
verification; it is not a casual dashboard action. Admin authorization,
server-side scope checks, CSRF/same-origin validation, and redaction remain
mandatory. Evidence: `.omo/evidence/task-12-waha-command-center.md`.

## Existing binding decisions

- RelayNest is one self-hosted tenant with Admin/Operator/Viewer users and
  explicit per-session grants; Personal and Business scopes never mix.
- WAHA credentials remain server-side and bundled WAHA remains unpublished on
  the internal Compose network. Public exposure requires TLS, firewalling,
  hardened headers/cookies, rate limiting, and explicit threat-model review.
- Scheduling is application-owned, PostgreSQL-backed, one-time, timezone-aware,
  restart-safe, idempotent, lease-protected, and bounded in retries. Delivery
  evidence is not proof that a recipient saw a message.
- Notifications use independently enabled Email/SMTP and Telegram channels.
- AI is provider-agnostic suggestion/draft assistance only; every send needs
  human approval. Media, recurring jobs, campaigns, broadcasts, autonomous
  sending, scraping, spam, stealth, and ban evasion remain outside MVP scope.

Protected plan and execution ledger remain the authoritative historical scope
records and must not be rewritten without explicit authorization.

## Build ordering

The root `build` script builds workspace declaration packages before the API and
web packages. `pnpm -r build` was not used because its parallel execution could
start the API before TypeScript project-reference outputs existed, producing
`TS6305` despite valid source. The ordered command is verified by the final
Todo 12 matrix.

## Auth integration WAHA fixture

The auth HTTP integration test uses a typed in-process WAHA client only for the
authorized session-read path. A separate service instance throws
`WahaConnectionUnavailableError` and must continue to produce HTTP 502. This
keeps authorization coverage deterministic without weakening the real upstream
unavailability contract.

## Messaging integration test clock isolation

**Date:** 2026-08-17

The PostgreSQL messaging idempotency test must not claim opaque ciphertext
fixtures from other serialized integration files. The failure was caused by the
shared test database and global `claimDue()` selection, not by encryption or
lease logic. Repository and retention fixtures now transition opaque jobs to
`cancelled` after their assertions, and the messaging fixture uses an explicit
`2000-01-01` synthetic clock before unrelated opaque fixtures. Production
`claimDue()` and AES-256-GCM fail-closed behavior remain unchanged. Three fresh
PostgreSQL 17.6 full-suite runs passed after this test-isolation correction.
