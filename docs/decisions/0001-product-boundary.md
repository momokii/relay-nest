# ADR 0001: Product Boundary and MVP Safety Model

- **Status:** Accepted
- **Date:** 2026-08-16
- **Decision source:** `.omo/plans/waha-command-center.md`, `## Locked product decisions`
- **Domain vocabulary:** `CONTEXT.md`

## Context

The command center must make two WhatsApp accounts usable by several people
without becoming a public SaaS product or an unrestricted WAHA proxy. It handles
sensitive communications and an unofficial WhatsApp client, so the MVP needs a
small, explicit product boundary and durable safety decisions before product
implementation begins.

## Decision

### Product and access boundary

**Product shape:** The product is a single self-hosted tenant with multiple application users and
multiple WAHA sessions, at minimum one Personal and one Business session.

**Account separation:** Personal and Business are hard-separated in navigation, server-side grants,
queries, analytics, AI context, retention, exports, and audit views. Admins
**Users and roles:** Admins create users; the only roles are Admin, Operator, and Viewer. A user's role is
combined with an explicit per-session grant; there is no public registration.

**WAHA connection:** The initial product has one active, runtime-configurable WAHA connection profile
containing multiple sessions. The adapter boundary must leave room for multiple
profiles later, but multiple profiles are not an MVP capability. **Swagger coverage:** Live OpenAPI and
official WAHA documentation are the contract for user-relevant session,
messaging, health, event, and dashboard-parity capabilities. Dangerous
infrastructure operations are Admin-only, and the product will not expose an
unrestricted raw endpoint launcher.

### Network boundary

**Network:** The dashboard binds to `0.0.0.0` for LAN/VPN convenience. In bundled deployment,
WAHA remains on an internal network and its API is not published. A public
deployment is not the default: it requires reverse-proxy HTTPS/TLS, firewall
restrictions, hardened cookies and headers, and explicit warning documentation.
WAHA credentials remain server-side and are never browser-visible.

### Scheduling and delivery boundary

**Scheduling:** The MVP supports immediate and one-time individual text messages. Every schedule
stores an explicit timezone, survives restarts, can be edited or cancelled before
dispatch, and uses bounded retries, idempotency, and lease protection. A missed
job becomes a visible recovery state rather than a silent late send.

**Delivery semantics:** The canonical delivery states are `scheduled`, `attempting`, `submitted`,
`acknowledged`, `failed`, `unknown`, and `cancelled`. Neither an HTTP response
nor WAHA `WORKING` status is recipient-delivery proof.

### Data, notification, and AI boundary

**Retention:** An Admin configures retention per category. Changing policy does not silently
delete data. Immediate purge requires a preview and explicit confirmation;
minimal content-free deletion audit metadata remains, and backups have their own
expiry. **Notifications:** Email/SMTP and Telegram are independently enabled notification channels.
Their SMTP fields, Telegram bot token, and chat IDs are encrypted and Admin-only;
test sends and in-app failure history are required.

**AI:** AI is provider-agnostic and limited to summaries, classification, and draft
suggestions. External processing is opt-in per feature/session. Human approval is
required for every send; autonomous replies and sending are not part of the MVP.

### Safety boundary

**Safety:** Sending is consent-first and gated by hard pacing/budgets, quiet hours,
duplicate-content and burst protection, newly-linked cooldowns, timelock/capping
signals, and batch approval. Scraping, spam, stealth, anti-detection,
ban-evasion behavior, and any promise of account safety are explicitly excluded.

### Exact acceptance case

**Acceptance case:** An Admin creates an Operator, grants access to one Personal or Business session,
links WAHA, schedules one text message, restarts before dispatch, observes the
persisted state, sends once, records an auditable outcome, and verifies outage
and bounded-retry behavior without a duplicate send.

## MVP and deferrals

**MVP boundary:** The MVP includes session/dashboard parity, immediate and scheduled individual
text messaging, contact lookup and validated manual numbers, restart recovery,
acknowledgments, scoped analytics, retention, audit, notifications, encryption,
tests, and external-WAHA/bundled-WAHA Compose modes.

The following are deferred and must not appear as MVP UI/API paths: media,
recurring schedules, campaigns, broadcasts, full inbox parity, autonomous AI
sending, multi-tenant SaaS, billing, white-labeling, public registration, and
public WAHA API exposure. Redis or another queue backend is also deferred unless
PostgreSQL scheduling is proven insufficient and separately approved.

**Recommended stack:** The planned implementation uses Node.js LTS, strict
TypeScript, Fastify, React/Vite, PostgreSQL, Drizzle, Zod, pnpm, Biome, Vitest,
Playwright, and Docker Compose. Exact versions remain subject to dependency and
security review.

## Consequences

- Scope is simpler than SaaS but authorization must remain session-specific and
  scope-specific everywhere.
- PostgreSQL-owned durable scheduling and auditability are product requirements;
  an external queue is not assumed.
- Network convenience increases dashboard exposure risk, so deployment warnings
  and public hardening guidance are part of the boundary.
- Delivery uncertainty is visible by design, which prevents false success at the
  cost of more recovery states and operator review.
- The unofficial-client ban risk remains unavoidable residual risk; conservative
  controls reduce but cannot eliminate it.

## Rejected alternatives

- **Multi-tenant SaaS:** rejected as outside the self-hosted product boundary.
- **Single-user-only access:** rejected because Admin-created users and roles are
  required.
- **Public WAHA exposure:** rejected because it would expose a high-impact API.
- **Recurring/campaign/broadcast sending:** rejected until one-time individual
  text delivery is reliable and safe.
- **Autonomous AI sending:** rejected because every send requires human approval.
