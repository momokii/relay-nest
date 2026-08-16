# waha-command-center - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A self-hosted, authenticated WhatsApp command center for separate Personal and Business WAHA sessions, with session-management parity, immediate text messaging, durable scheduling, scoped analytics, retention controls, notifications, and two Docker deployment modes.

**Why this approach:** Keep WAHA as a version-pinned transport adapter while PostgreSQL owns durable scheduling, events, analytics, encryption metadata, and auditability. Start text-first and safety-first so the core promise is reliable before adding media, recurrence, campaigns, or autonomous AI.

**What it will NOT do:** It will not be multi-tenant SaaS, expose WAHA credentials publicly, or include public registration. The MVP will not include media, recurring campaigns, broadcasts, autonomous AI sending, anti-detection behavior, or a full WhatsApp-Web inbox clone.

**Effort:** XL
**Risk:** High - unofficial WAHA behavior, sensitive communications, engine/version differences, and reliable exactly-once-like scheduling semantics.
**Decisions to sanity-check:** Proposed TypeScript/PostgreSQL modular monolith; dashboard `0.0.0.0` convenience binding with WAHA kept internal; application-level encryption; PostgreSQL lease-based scheduler; text-only MVP boundary.

Your next move: review and approve this plan; approval authorizes planning acceptance only. Implementation starts in a separate explicit execution step.

---

> TL;DR (machine): XL/high-risk plan for a version-pinned WAHA adapter, secure multi-user session control, PostgreSQL-backed encrypted text scheduling, analytics/notifications, and dashboard-only/bundled Docker modes.

## Scope
### Must have

- A single-tenant, self-hosted, multi-user command center for at least Personal and Business WAHA sessions.
- Official WAHA OpenAPI capability matrix pinned to a tested WAHA image/version; all relevant dashboard/session/messaging capabilities represented.
- TypeScript modular monolith: Node.js LTS, Fastify API/worker, React + Vite UI, PostgreSQL, Drizzle migrations, Zod boundary schemas, pnpm workspace, Biome, Vitest, and Playwright.
- Admin/Operator/Viewer roles with per-session grants; no public registration.
- Runtime WAHA connection settings with server-side API keys and health checks.
- Docker Compose dashboard-only mode and optional bundled-WAHA mode; dashboard port exposed for LAN/VPN convenience, WAHA API internal by default.
- Session list/status, QR/pairing/passkey capability discovery, start/stop/restart/logout, session health, timelock, and capping visibility.
- Immediate and durable one-time individual text messaging, contact lookup, validated manual phone entry, cancellation/editing before dispatch, retries, idempotency, and restart recovery.
- HMAC-validated/idempotent webhook ingestion, message acknowledgment state, session status history, audit events, and aggregate/per-session analytics.
- Application-level encryption for message content, contacts, notification secrets, WAHA credentials, and AI data; configurable retention and confirmation-gated purge.
- Optional SMTP and Telegram notifications with encrypted Admin-only settings, category toggles, test sends, and redacted history.
- Human-approved provider-agnostic AI seams, with no autonomous sending in the MVP.
- README, architecture, setup/deployment, security, operations, WAHA compatibility, domain glossary, and persistent agent-state updates.
### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do not build multi-tenant SaaS, billing, public registration, or white-labeling.
- Do not expose the WAHA API or master key to browsers or public interfaces.
- Do not make `WORKING` equal delivery success; preserve accepted/acknowledged/failed/unknown distinctions.
- Do not implement media, recurring jobs, campaigns, broadcasts, full inbox parity, autonomous AI sending, or anti-detection behavior in the MVP.
- Do not add Redis or another second queue backend unless PostgreSQL scheduling is proven insufficient and the user approves the dependency.
- Do not persist plaintext secrets or sensitive content in logs, fixtures, browser storage, or error responses.
- Do not use unbounded retries, automatic restart loops on timelock/capping errors, or duplicate-prone retry semantics.
- Do not silently purge existing data when retention settings change.
- Do not use unpinned `latest` production images or add dependencies without vulnerability review and decision-log entry.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for scheduling, encryption, authorization, and WAHA adapter contracts; tests-after for static docs and Compose wiring. Frameworks: Vitest, Fastify inject, Testcontainers/PostgreSQL, and Playwright.
- Every implementation todo must run focused happy/failure checks plus the relevant full suite and save output under `.omo/evidence/`.
- Required final commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm audit --audit-level=high`, and Compose config validation with `docker compose config` for each supported mode.
- Evidence: `.omo/evidence/task-<N>-waha-command-center.md` and final verification reports.

## Locked product decisions

The executor has no conversation context. These decisions are authoritative for
this plan and must be copied into the durable project decision document by Todo 2:

- **Product shape:** Single self-hosted tenant; multiple application users; multiple WAHA sessions, at minimum Personal and Business.
- **Account separation:** Personal and Business are hard-separated in navigation, grants, queries, analytics, AI context, retention, exports, and audit views.
- **Users and roles:** Admin creates users; roles are Admin, Operator, and Viewer; access is granted per WAHA session; no public registration.
- **WAHA connection:** One active runtime-configurable WAHA connection profile initially, containing multiple sessions; design the adapter seam for later multiple profiles.
- **Swagger coverage:** Treat the live OpenAPI and official docs as the contract; map all user-relevant capabilities, keep dangerous infrastructure operations Admin-only, and do not expose an unrestricted raw endpoint launcher.
- **Network:** Dashboard binds to `0.0.0.0` for LAN/VPN convenience; bundled WAHA is internal and its API is not published; public deployment requires reverse-proxy HTTPS/TLS, firewall restrictions, hardened cookies/headers, and explicit warning documentation.
- **Scheduling:** One-time jobs only in the MVP; explicit stored timezone; durable state across restarts; edit/cancel before dispatch; bounded retries; idempotency/lease protection; missed jobs become visible recovery states rather than silent late sends.
- **Delivery semantics:** Use precise states (`scheduled`, `attempting`, `submitted`, `acknowledged`, `failed`, `unknown`, `cancelled`); never claim recipient delivery from an HTTP response alone.
- **Retention:** Admin-configurable per category; changing policy does not silently delete; immediate purge requires a preview and explicit confirmation; retain minimal content-free deletion audit metadata; backups have their own expiry.
- **Notifications:** Email and Telegram are independently enabled; Admin-only encrypted configuration includes SMTP fields and Telegram bot token/chat IDs; test-send controls are required; in-app failure history remains available.
- **AI:** Provider-agnostic summaries, classification, and draft suggestions; human approval is required for every send; no autonomous replies/sending in the MVP; external processing is opt-in per feature/session.
- **Safety:** Consent-first sending, hard pacing/budgets, quiet hours, duplicate-content/burst protection, newly-linked cooldowns, timelock/capping gates, and batch approval; no scraping, spam, stealth, anti-detection, or ban-evasion behavior.
- **MVP:** Session/dashboard parity, immediate and scheduled individual text messaging, contact lookup/manual validated numbers, restart recovery, acknowledgments, analytics, retention, audit, notifications, encryption, tests, and external/bundled Compose modes. Media, recurring schedules, campaigns, broadcasts, full inbox parity, and autonomous AI are deferred.
- **Acceptance case:** Admin creates an Operator, grants one Personal/Business session, links WAHA, schedules one text message, restarts before dispatch, observes persisted state, sends once, records an auditable outcome, and verifies outage/retry behavior.
- **Recommended stack:** Node.js LTS, TypeScript strict mode, Fastify, React/Vite, PostgreSQL, Drizzle, Zod, pnpm, Biome, Vitest, Playwright, and Docker Compose; exact versions are locked only after dependency/security review.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- **Wave 1 — Grounding and foundation:** capability evidence, domain/threat docs, workspace/toolchain, database/encryption foundation.
- **Wave 2 — Integration and access:** auth/RBAC, WAHA adapter/config, session parity, webhook ingestion.
- **Wave 3 — Core user value:** scheduler, messaging/contact flows, notifications, retention/audit.
- **Wave 4 — Product surfaces and deployment:** analytics, dashboard UI, Compose modes, backup/operations.
- **Wave 5 — Final verification:** full test/security/Compose review and recursive requirement audit.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |

| 1 | None | 3, 6, 7, 8, 15 | 2 |
| 2 | Locked product decisions in this plan | 3, 4, 5, 9, 12, 16 | 1 |
| 3 | 1, 2 | 4, 5, 6, 15 | None |
| 4 | 2, 3 | 5, 9, 12, 16 | 6, 8 |
| 5 | 3, 4 | 7, 10, 14 | 6, 8 |
| 6 | 1, 3 | 7, 8, 10, 15 | 4, 5 |
| 7 | 5, 6 | 14, 15 | 8 |
| 8 | 4, 6 | 13, 16 | 7 |
| 9 | 4, 6 | 10, 11, 13, 14 | 12 |
| 10 | 5, 6, 9 | 11, 13, 14 | 12 |
| 11 | 4, 5, 9, 10 | 14, 16 | 12 |
| 12 | 4, 5 | 14, 16 | 9, 10, 11 |
| 13 | 8, 9, 10 | 14, 16 | 12 |
| 14 | 5, 7, 9, 10, 11, 13 | 16 | 15 |
| 15 | 1, 3, 6, 7 | 16 | 14 |
| 16 | 11, 12, 13, 14, 15 | F1-F4 | None |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Record the WAHA capability matrix and pin a tested contract
  What to do / Must NOT do: Create `docs/waha-capability-matrix.md` from the official OpenAPI 2026.8.1 and docs, covering sessions, QR/pairing/passkey, messaging, contacts/chats, media, webhooks, health, auth keys, storage, engine differences, timelock/capping, and native dashboard parity. Pin the selected WAHA image/version and document stale Swagger discrepancies. Must not rely on undocumented endpoints or claim all engines behave identically.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 3, 6, 7, 8, 15
  References (executor has NO interview context - be exhaustive): `docs/waha-capability-matrix.md`; https://waha.devlike.pro/swagger/openapi.json; https://waha.devlike.pro/docs/how-to/sessions/; https://waha.devlike.pro/docs/how-to/events/; https://waha.devlike.pro/docs/how-to/security/
  Acceptance criteria (agent-executable): Document every required API capability with endpoint/method, engine caveat, auth scope, and test status; record OpenAPI version/hash or retrieval date; a script validates every mandatory parity capability has a matrix row.
  QA scenarios (name the exact tool + invocation): happy: `pnpm docs:check`; failure: remove a mandatory capability row in a temporary copy and confirm the checker fails. Evidence `.omo/evidence/task-1-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [x] 2. Capture the domain model, threat model, and explicit product boundaries
  What to do / Must NOT do: Create `CONTEXT.md`, `docs/threat-model.md`, `docs/decisions/0001-product-boundary.md`, and update `.claude/state/DECISIONS_LOG.md` with every item under `## Locked product decisions`. Must not turn the glossary into implementation details or silently add deferred features.
  Parallelization: Wave 1 | Blocked by: None; use `## Locked product decisions` | Blocks: 3, 4, 5, 9, 12, 16
  References (executor has NO interview context - be exhaustive): `## Locked product decisions` in this plan; `.claude/README.md`; `.claude/AGENT_RULES.md`; `.claude/SECURITY_STANDARDS.md`; `.claude/state/CURRENT_STATUS.md`
  Acceptance criteria (agent-executable): Glossary defines tenant, user, role, WAHA connection, session, account scope, schedule, dispatch attempt, acknowledgment, delivery evidence, retention policy, purge, and notification; threat model covers public dashboard exposure, WAHA credentials, webhook spoofing, duplicate sends, AI leakage, and insider cross-account access.
  QA scenarios (name the exact tool + invocation): happy: `pnpm docs:check`; failure: a terminology/reference check detects an undefined canonical term. Evidence `.omo/evidence/task-2-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [x] 3. Bootstrap the typed modular-monolith workspace and Compose skeleton
  What to do / Must NOT do: Create the pnpm workspace with `apps/api`, `apps/web`, and shared packages for domain/config/WAHA contracts; configure Node LTS, TypeScript strict mode, Fastify, React/Vite, Zod, Drizzle, Biome, Vitest, Playwright, and CI-quality scripts. Create base Dockerfiles and Compose files without product endpoints. Must not add a dependency without version pinning, vulnerability review, and decision-log entry.
  Parallelization: Wave 1 | Blocked by: 1, 2 | Blocks: 4, 5, 6, 15
  References (executor has NO interview context - be exhaustive): `## Locked product decisions` in this plan; `.claude/CODING_STANDARDS.md`; `.claude/SECURITY_STANDARDS.md`; `.claude/ENVIRONMENT_GUIDE.md`
  Acceptance criteria (agent-executable): `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `docker compose config` all exit 0; no production Compose file publishes WAHA directly; dependency audit is clean or documented with explicit approval.
  QA scenarios (name the exact tool + invocation): happy: run all commands above; failure: inject a strict TypeScript error and confirm `pnpm typecheck` fails, then remove it. Evidence `.omo/evidence/task-3-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [x] 4. Implement PostgreSQL schema, envelope encryption, and migration foundation
  What to do / Must NOT do: Add migrations and typed repositories for users, roles/grants, WAHA connections, sessions, contacts, scheduled jobs, dispatch attempts, normalized events, audit entries, notifications, retention policies, and encrypted fields. Use application-level AES-256-GCM envelope encryption with an infrastructure-managed master key and blind indexes only where exact lookup is required. Must not log plaintext or make key rotation a casual UI action.
  Parallelization: Wave 1 | Blocked by: 2, 3 | Blocks: 5, 9, 12, 16
  References (executor has NO interview context - be exhaustive): `docs/threat-model.md`; `.claude/SECURITY_STANDARDS.md`; `.claude/state/DECISIONS_LOG.md`
  Acceptance criteria (agent-executable): Fresh and repeat migrations succeed; encrypted columns are unreadable without the key; wrong-key/tampered-ciphertext tests fail closed; repository tests cover tenant/account scope, uniqueness, retention metadata, and audit immutability.
  QA scenarios (name the exact tool + invocation): happy: `pnpm db:test`; failure: run decrypt with a modified authentication tag and assert a typed error with no plaintext log. Evidence `.omo/evidence/task-4-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [x] 5. Implement dashboard authentication, roles, and per-session authorization
  What to do / Must NOT do: Add Admin bootstrap, Admin-created users, secure password hashing, session cookies, logout/revocation, Admin/Operator/Viewer roles, and per-session grants. Enforce hard Personal/Business scope server-side on every query and command. Must not add public registration, browser-visible WAHA credentials, or client-only authorization.
  Parallelization: Wave 2 | Blocked by: 3, 4 | Blocks: 7, 10, 14
  References (executor has NO interview context - be exhaustive): `docs/threat-model.md`; `.claude/SECURITY_STANDARDS.md`; `.claude/AGENT_RULES.md`
  Acceptance criteria (agent-executable): Unauthenticated API/UI requests are rejected; Admin can create/disable users and grant sessions; Operator cannot read/send across an ungranted account; Viewer cannot mutate; auth failures are rate-limited and audited; secrets never appear in response payloads.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- auth`; failure: cross-scope request and disabled-user request both return safe denial without data leakage. Evidence `.omo/evidence/task-5-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [x] 6. Build the server-side WAHA adapter and runtime connection health checks
  What to do / Must NOT do: Implement typed WAHA HTTP/webhook clients with version/capability negotiation, server-side API-key handling, timeout/cancellation, redacted errors, health/version/environment checks, and Admin-only runtime connection settings. Support external URL and bundled service references. Must not send master keys to the browser or assume one engine supports every endpoint.
  Parallelization: Wave 2 | Blocked by: 1, 3 | Blocks: 7, 8, 10, 15
  References (executor has NO interview context - be exhaustive): `docs/waha-capability-matrix.md`; https://waha.devlike.pro/docs/how-to/security/; https://waha.devlike.pro/docs/how-to/engines/
  Acceptance criteria (agent-executable): Contract tests cover success, timeout, auth failure, stale version, unsupported capability, and redacted error paths; health check reports service health separately from session connectivity; API keys never enter browser/network logs.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- waha-adapter`; failure: mock 401/timeout/463/475 and assert typed classifications and no automatic restart loop. Evidence `.omo/evidence/task-6-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [x] 7. Implement WAHA session lifecycle and linking parity
  What to do / Must NOT do: Add session list/status/metadata, create/update/delete where safe, start/stop/restart/logout, QR, pairing-code, passkey capability discovery, `/me`, status history, timelock, and capping views. Use scoped permissions and explicit confirmations for destructive lifecycle actions. Must not equate `WORKING` with unrestricted sending.
  Parallelization: Wave 2 | Blocked by: 5, 6 | Blocks: 14, 15
  References (executor has NO interview context - be exhaustive): `docs/waha-capability-matrix.md`; https://waha.devlike.pro/docs/how-to/sessions/; https://waha.devlike.pro/swagger/openapi.json
  Acceptance criteria (agent-executable): API/UI tests exercise every native-dashboard floor capability; QR/pairing response formats are handled without exposing master keys; Personal/Business session filters and grants cannot cross scope.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- sessions`; failure: unsupported auth method and destructive action without Admin confirmation are rejected safely. Evidence `.omo/evidence/task-7-waha-command-center.md`.
  Commit: e82aa34

- [x] 8. Implement HMAC webhook ingestion and normalized event storage
  What to do / Must NOT do: Add a webhook endpoint that validates WAHA HMAC/timestamp, deduplicates request/event IDs, stores redacted normalized events, updates session/message acknowledgment state, and tolerates webhook retries/out-of-order delivery. Must not trust unsigned events or use WebSocket delivery as the only durable source.
  Parallelization: Wave 2 | Blocked by: 4, 6 | Blocks: 13, 16
  References (executor has NO interview context - be exhaustive): `docs/waha-capability-matrix.md`; https://waha.devlike.pro/docs/how-to/events/
  Acceptance criteria (agent-executable): Valid signed event is accepted exactly once; invalid signature, stale timestamp, duplicate, malformed payload, and out-of-order event tests behave deterministically; raw sensitive payload retention follows policy.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- webhooks`; failure: replay a signed event and assert one state transition/audit effect. Evidence `.omo/evidence/task-8-waha-command-center.md`.
  Commit: 50dd999

- [x] 9. Implement durable one-time scheduler and dispatch state machine
  What to do / Must NOT do: Add PostgreSQL-backed jobs using transactional claiming/leases, explicit timezone, queued/attempting/submitted/acknowledged/failed/unknown/cancelled states, bounded exponential retry, cancellation/edit locks, idempotency keys, restart recovery, and timelock/capping/session/consent gates. Must not add recurring jobs, infinite retries, or duplicate-prone restarts.
  Parallelization: Wave 3 | Blocked by: 4, 6 | Blocks: 10, 11, 13, 14
  References (executor has NO interview context - be exhaustive): `## Locked product decisions` in this plan; `docs/threat-model.md`; https://waha.devlike.pro/docs/overview/how-to-avoid-blocking/
  Acceptance criteria (agent-executable): Unit tests cover timezone/DST, restart-before-send, missed schedule, cancellation race, WAHA unavailable, disconnected session, 463/475 gate, retry exhaustion, idempotent duplicate worker claim, and no duplicate send after retry.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- scheduler`; failure: kill worker after claim and restart it; assert lease recovery and at-most-once dispatch key behavior. Evidence `.omo/evidence/task-9-waha-command-center.md`.
  Commit: 9a73d0b, d41368e

- [ ] 10. Implement contact resolution and immediate/scheduled text sending
  What to do / Must NOT do: Add WAHA contact lookup/search, manual phone-number normalization/validation, existing-chat selection, immediate send, scheduled send integration, per-session rate budgets, consent/opt-out metadata, and safe acknowledgment display. Must not support groups/broadcasts/new-contact campaigns in the MVP.
  Parallelization: Wave 3 | Blocked by: 5, 6, 9 | Blocks: 11, 13, 14
  References (executor has NO interview context - be exhaustive): `docs/waha-capability-matrix.md`; https://waha.devlike.pro/docs/how-to/contacts/; https://waha.devlike.pro/docs/how-to/send-messages/; https://waha.devlike.pro/docs/how-to/chats/
  Acceptance criteria (agent-executable): Valid manual number and WAHA contact both resolve to scoped targets; invalid numbers fail before WAHA; immediate and scheduled sends create audit/attempt records; duplicate command/idempotency tests do not send twice.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- messaging`; failure: invalid number, ungranted session, capped session, and WAHA timeout each produce safe user-visible state without leaked payloads. Evidence `.omo/evidence/task-10-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [ ] 11. Implement SMTP/Telegram notifications and delivery preferences
  What to do / Must NOT do: Add independently enabled notification channels, encrypted Admin-only settings, category preferences, masked secret handling, test sends, retry/backoff, and in-app failure history. Support SMTP configuration and Telegram bot token/chat ID(s). Must not use WhatsApp as the only failure channel or log provider credentials.
  Parallelization: Wave 3 | Blocked by: 4, 5, 9, 10 | Blocks: 14, 16
  References (executor has NO interview context - be exhaustive): `## Locked product decisions` in this plan; `.claude/SECURITY_STANDARDS.md`; `.claude/ENVIRONMENT_GUIDE.md`
  Acceptance criteria (agent-executable): Admin can enable/configure/test each channel; non-Admin cannot read secrets; disabled channels produce no outbound attempt; transient provider failures retry within bounds and audit redacted results.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- notifications`; failure: provider timeout and malformed Telegram response produce retry/failure state without secret output. Evidence `.omo/evidence/task-11-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [ ] 12. Implement retention policies, confirmation-gated purge, audit logging, and encrypted backups
  What to do / Must NOT do: Add per-category retention settings, preview/count-before-delete, explicit confirmation, immediate purge jobs, immutable minimal deletion audit records, audit coverage for sends/session/config/user changes, encrypted backup/restore of DB and key metadata, and operational key-rotation runbook. Must not silently delete audit accountability or promise instant removal from existing backups.
  Parallelization: Wave 3 | Blocked by: 4, 5 | Blocks: 14, 16
  References (executor has NO interview context - be exhaustive): `## Locked product decisions` in this plan; `.claude/SECURITY_STANDARDS.md`; `docs/threat-model.md`
  Acceptance criteria (agent-executable): Policy change alone never deletes; confirmed purge deletes only selected scope/category; audit record remains content-free; backup restore recovers jobs and encrypted records; wrong/missing key fails closed.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- retention`; failure: cancel purge confirmation and assert zero deletion, then restore a test backup and verify scope boundaries. Evidence `.omo/evidence/task-12-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [ ] 13. Build aggregate and per-session analytics projections
  What to do / Must NOT do: Derive scoped message volume, direction, acknowledgment breakdown, failure/retry rates, session uptime/status history, timelock/capping indicators, contact activity, and scheduled-job outcomes from normalized events and local records. Make Personal/Business filters mandatory. Must not infer recipient delivery from missing events or expose cross-scope aggregates.
  Parallelization: Wave 4 | Blocked by: 8, 9, 10 | Blocks: 14, 16
  References (executor has NO interview context - be exhaustive): `docs/waha-capability-matrix.md`; https://waha.devlike.pro/docs/how-to/events/; https://waha.devlike.pro/swagger/openapi.json
  Acceptance criteria (agent-executable): Projection tests reconcile known fixtures; empty/partial/out-of-order event sets show “unknown” rather than false success; Admin/Operator/Viewer scope filters are enforced.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test -- analytics`; failure: cross-session query and incomplete acknowledgment fixture cannot leak or overstate delivery. Evidence `.omo/evidence/task-13-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [ ] 14. Build the authenticated dashboard UI and human-approved AI seam
  What to do / Must NOT do: Create responsive dashboard navigation for sessions, Personal/Business scope, contacts, immediate send, scheduling, job detail, analytics, notifications, retention, users, and settings; expose Admin-only controls and warnings. Add provider-agnostic AI interface for summaries/classification/draft suggestions with explicit approval, but no autonomous send. Must not build full inbox, media composer, campaigns, or raw unrestricted API UI.
  Parallelization: Wave 4 | Blocked by: 5, 7, 9, 10, 11, 13 | Blocks: 16
  References (executor has NO interview context - be exhaustive): `## Locked product decisions` in this plan; `.claude/README.md`; `.claude/SECURITY_STANDARDS.md`; `docs/waha-capability-matrix.md`
  Acceptance criteria (agent-executable): Playwright covers Admin bootstrap, user grant, session linking/status, immediate text send, schedule/edit/cancel, restart recovery, failure notification, retention confirmation, and scope denial; keyboard/a11y smoke checks pass; AI draft always requires confirmation.
  QA scenarios (name the exact tool + invocation): happy: `pnpm test:e2e -- dashboard`; failure: attempt Personal action from Business-only Operator and inspect no sensitive data appears. Evidence `.omo/evidence/task-14-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [ ] 15. Complete Docker Compose deployment modes and operational documentation
  What to do / Must NOT do: Finish one Compose setup with dashboard-only external-WAHA mode and bundled-WAHA profile, Postgres persistence, secret injection, health checks, migrations, non-root containers, pinned images, `0.0.0.0` warning, internal WAHA networking, LAN/VPN firewall guidance, and reverse-proxy TLS public-deployment guidance. Document WAHA ban risk and mitigations prominently in README/setup docs. Must not use `latest` in production or publish WAHA master ports.
  Parallelization: Wave 4 | Blocked by: 1, 3, 6, 7 | Blocks: 16
  References (executor has NO interview context - be exhaustive): `.claude/ENVIRONMENT_GUIDE.md`; `.claude/SECURITY_STANDARDS.md`; https://waha.devlike.pro/docs/how-to/install/; https://waha.devlike.pro/docs/how-to/security/; https://waha.devlike.pro/docs/overview/introduction/
  Acceptance criteria (agent-executable): `docker compose config` passes for dashboard-only and bundled profiles; startup health checks gate dependencies; containers run non-root; no secret values appear in Compose config; README explicitly describes unofficial-client ban risk and mitigations.
  QA scenarios (name the exact tool + invocation): happy: start a disposable Postgres/dashboard stack and run health checks; failure: missing secret or unavailable external WAHA fails with actionable redacted error. Evidence `.omo/evidence/task-15-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

- [ ] 16. Run recursive security, requirement, and release-readiness verification
  What to do / Must NOT do: Review every brief requirement against implementation, run full checks, dependency audit, secret scan, authorization matrix, scheduler failure matrix, Compose modes, backup restore, and documentation freshness; fix defects found in scope. Must not declare complete with known failures or silently expand scope.
  Parallelization: Wave 5 | Blocked by: 11, 12, 13, 14, 15 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `## Scope` and `## Locked product decisions` in this plan; entire `.claude/` hierarchy; `docs/threat-model.md`; `docs/waha-capability-matrix.md`
  Acceptance criteria (agent-executable): `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm audit --audit-level=high`; Compose config passes all modes; security/requirements checklist has no unresolved Must-have item; `.claude/state/CURRENT_STATUS.md`, `TASK_QUEUE.md`, and `DECISIONS_LOG.md` are current.
  QA scenarios (name the exact tool + invocation): happy: execute the complete command chain and produce a release report; failure: intentionally use an invalid WAHA key and verify no secret/message content leaks in logs. Evidence `.omo/evidence/task-16-waha-command-center.md`.
  Commit: N | no commit until explicitly requested

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — run `pnpm verify:requirements --plan .omo/plans/waha-command-center.md`; assert every Must-have has an implementation/test reference, every Must-NOT-have has a negative assertion, and exit non-zero for any unmapped item. Save `.omo/evidence/final-plan-compliance.md`.
- [ ] F2. Code quality and security review — run `pnpm lint && pnpm typecheck && pnpm audit --audit-level=high && pnpm secret-scan`; inspect auth/scope, encryption/key handling, error redaction, dependency lockfile, and Docker user/port settings. Any high vulnerability, secret match, type/lint failure, or cross-scope leak fails the gate. Save `.omo/evidence/final-security-quality.md`.
- [ ] F3. Real executable QA — run `pnpm test:e2e -- --grep "schedule|restart|outage|invalid recipient|463|475|cancel|duplicate|notification|purge|backup"` against disposable Postgres and mocked WAHA; assert one scheduled send, visible recovery states, bounded retries, no duplicate dispatch, notification toggles, confirmation-gated purge, and successful encrypted restore. Save `.omo/evidence/final-e2e.md`.
- [ ] F4. Scope fidelity and documentation review — run `pnpm verify:scope && pnpm docs:check`; assert no MVP UI/API path for media, recurring jobs, campaigns, broadcasts, autonomous sending, public registration, or public WAHA API exposure, and confirm README/setup/security/operations plus all `.claude/` state files match actual behavior. Save `.omo/evidence/final-scope-docs.md`.

## Commit strategy

Do not commit automatically. The implementation worker must keep changes reviewable
and report verification evidence. Any commit requires a separate explicit user
request and must follow the repository's git safety rules.

## Success criteria

- All 16 todos and F1–F4 pass with evidence files.
- Native WAHA dashboard floor is covered for the pinned tested version, with engine/version caveats visible.
- Personal and Business data/actions are isolated by server-side grants and tested against cross-scope access.
- A scheduled text message survives restart, dispatches once, records precise outcome, and handles WAHA failure without duplicate sends.
- Secrets and sensitive content are encrypted or redacted everywhere required; deletion and backup behavior is explicit and tested.
- Dashboard-only and bundled-WAHA Compose modes validate and run with no publicly published WAHA master API.
- README/setup docs prominently disclose unofficial-client ban risk and implemented mitigations.
- Product state, decisions, standards, and environment docs are updated for a fresh agent handoff.
