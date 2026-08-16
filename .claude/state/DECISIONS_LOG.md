# Decisions Log

This file is the permanent record of significant architectural, technical,
product, security, and operational decisions. Add an entry when a choice affects
future work, dependencies, data, interfaces, deployment, or risk. Do not use this
file as a general progress journal; progress belongs in `CURRENT_STATUS.md`.

## Current Decisions

### Decision: Pinned PostgreSQL driver for Drizzle migrations

**Date:** 2026-08-16
**Context:** Todo 4's Drizzle migration command requires a PostgreSQL driver at runtime; the bootstrap package had Drizzle Kit and Drizzle ORM but no driver.
**Rationale:** Add `postgres@3.4.7`, the small ESM-compatible driver supported by the existing Drizzle stack, without introducing a second ORM or migration path.
**Alternatives Rejected:** `pg` would require an additional type package and CommonJS interop surface; adding a custom SQL runner would duplicate Drizzle Kit behavior.
**Security Implications:** The driver receives the existing `DATABASE_URL`; no credentials are logged or persisted by the application code. The dependency audit remained clean at high severity after installation.
**Impact:** `apps/api` can run fresh and repeat Drizzle migrations against disposable PostgreSQL instances.

### Decision: Todo 3 typed workspace and pinned deployment scaffold

**Date:** 2026-08-16
**Context:** Todo 3 requires a reproducible Node.js LTS modular-monolith foundation before product behavior is implemented.
**Rationale:** Use pnpm 10.12.4 with Node.js 22.23.1, strict TypeScript, Fastify, React/Vite, Zod, Drizzle, Biome, Vitest, and Playwright. Pin all dependency versions and use the audited WAHA contract target `devlikeapro/waha:2026.8.1`. Keep WAHA internal in Compose; external-WAHA mode supplies its URL at runtime.
**Alternatives Rejected:** Unpinned ranges and `latest` images would permit stale or vulnerable resolution; publishing the WAHA port would violate the locked network boundary; adding product endpoints would exceed the bootstrap todo.
**Security Implications:** App containers run as the built-in non-root `node` user. PostgreSQL credentials use an external Compose secret, WAHA keys are environment-injected, and no WAHA host port is published. `pnpm audit --audit-level=high` passed after the patched-version review; a pnpm `esbuild@0.25.12` override removes the remaining moderate transitive advisory from Drizzle Kit's deprecated loader path.
**Impact:** Later todos receive package boundaries for domain/config/WAHA contracts, API and web shells, Drizzle migration hooks, and two Compose deployment modes without business behavior.

### Decision: Locked WAHA Command Center product decisions

**Date:** 2026-08-16
**Source:** `.omo/plans/waha-command-center.md`, `## Locked product decisions`
**Status:** Accepted for Todo 2; implementation remains separately gated.

The following product decisions are locked and must remain aligned across future
implementation, tests, operations, and documentation:

1. **Product shape:** one self-hosted tenant, multiple application users, and
   multiple WAHA sessions, at minimum Personal and Business.
2. **Account separation:** Personal and Business are hard-separated in
   navigation, grants, queries, analytics, AI context, retention, exports, and
   audit views.
3. **Users and roles:** Admin creates users; roles are Admin, Operator, and
   Viewer; access is granted per WAHA session; public registration is absent.
4. **WAHA connection:** one active runtime-configurable connection profile
   initially contains multiple sessions; the adapter seam may later support
   multiple profiles.
5. **Swagger coverage:** live OpenAPI and official docs are the contract for
   user-relevant capabilities; dangerous infrastructure operations are
   Admin-only; no unrestricted raw endpoint launcher.
6. **Network:** the dashboard binds to `0.0.0.0` for LAN/VPN convenience;
   bundled WAHA is internal and unpublished; public deployment requires
   reverse-proxy HTTPS/TLS, firewall restrictions, hardened cookies/headers,
   and explicit warnings.
7. **Scheduling:** MVP schedules are one-time, store an explicit timezone,
   survive restarts, support edit/cancel before dispatch, use bounded retries,
   idempotency, and lease protection, and expose missed jobs as recovery states.
8. **Delivery semantics:** states are `scheduled`, `attempting`, `submitted`,
   `acknowledged`, `failed`, `unknown`, and `cancelled`; neither HTTP acceptance
   nor `WORKING` claims recipient delivery.
9. **Retention:** Admin-configurable per category; policy changes do not
   silently delete; purge requires preview and explicit confirmation; minimal
   content-free deletion audit metadata remains; backups have separate expiry.
10. **Notifications:** Email/SMTP and Telegram are independently enabled;
    Admin-only encrypted settings include SMTP fields and Telegram bot token/chat
    IDs; test sends and in-app failure history are required.
11. **AI:** provider-agnostic summaries, classification, and draft suggestions;
    external processing is opt-in per feature/session; human approval is required
    for every send; autonomous replies/sending are excluded from MVP.
12. **Safety:** consent-first sending with hard pacing/budgets, quiet hours,
    duplicate-content/burst protection, newly-linked cooldowns, timelock/capping
    gates, and batch approval; no scraping, spam, stealth, anti-detection, or
    ban-evasion behavior.
13. **MVP boundary:** session/dashboard parity, immediate and scheduled
    individual text messaging, contact lookup/validated manual numbers, restart
    recovery, acknowledgments, analytics, retention, audit, notifications,
    encryption, tests, and external/bundled Compose modes. Media, recurring
    schedules, campaigns, broadcasts, full inbox parity, and autonomous AI are
    deferred.
14. **Acceptance case:** Admin creates an Operator, grants one Personal/Business
    session, links WAHA, schedules one text message, restarts before dispatch,
    observes persisted state, sends once, records an auditable outcome, and
    verifies outage/retry behavior.
15. **Recommended stack:** Node.js LTS, strict TypeScript, Fastify, React/Vite,
    PostgreSQL, Drizzle, Zod, pnpm, Biome, Vitest, Playwright, and Docker
    Compose; exact versions remain subject to dependency/security review.

**Durable references:** `CONTEXT.md` defines the domain terms;
`docs/decisions/0001-product-boundary.md` records the product boundary;
`docs/threat-model.md` records the threat controls and residual risks.

### Decision: Single-tenant, multi-user, multi-session product boundary

**Date:** 2026-08-16
**Context:** The product must serve Personal and Business WhatsApp accounts while allowing an administrator to create other users.
**Rationale:** A single self-hosted tenant avoids premature SaaS complexity while Admin/Operator/Viewer roles and per-session grants support practical use. Personal and Business scopes remain hard-separated.
**Alternatives Rejected:** Single-user-only would not support the requested Admin-created users; multi-tenant SaaS would add unnecessary billing and tenant-provisioning scope.
**Security Implications:** Authorization is server-side and session-scoped; no public registration; cross-account access is denied by default.
**Impact:** Every query, audit event, analytics projection, AI context, retention operation, and UI filter must carry account/session scope.

### Decision: Application-owned durable scheduling

**Date:** 2026-08-16
**Context:** WAHA exposes send operations but no general delayed-send resource in the audited OpenAPI.
**Rationale:** PostgreSQL-backed one-time jobs provide restart recovery, explicit timezones, bounded retries, idempotency, cancellation, and auditable outcomes.
**Alternatives Rejected:** WAHA-native event messages are not a general scheduling system; an external queue would add a dependency before it is needed.
**Security Implications:** Timelock/capping/session/consent gates must run before dispatch; retries must not duplicate-send.
**Impact:** Scheduler state, dispatch attempts, and acknowledgment evidence become first-class domain data.

### Decision: Dashboard exposure with internal WAHA

**Date:** 2026-08-16
**Context:** The user wants Docker access from other devices but does not want unsafe WAHA exposure.
**Rationale:** Bind the dashboard to `0.0.0.0` for LAN/VPN convenience, keep bundled WAHA internal, and require reverse-proxy TLS/firewall hardening for public deployment.
**Alternatives Rejected:** Publishing WAHA directly would expose a high-impact API; localhost-only would not satisfy convenient LAN/VPN access.
**Security Implications:** Dashboard authentication, secure cookies, CSRF protection, login rate limits, server-side keys, and explicit exposure warnings are mandatory.
**Impact:** Compose and deployment documentation must make network boundaries visible and test both dashboard-only and bundled modes.

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
