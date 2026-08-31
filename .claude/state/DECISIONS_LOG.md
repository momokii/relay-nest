# Decisions Log

This file is the permanent record of significant architectural, technical,
product, security, and operational decisions. Add an entry when a choice affects
future work, dependencies, data, interfaces, deployment, or risk. Do not use this
file as a general progress journal; progress belongs in `CURRENT_STATUS.md`.

## Current Decisions

### Decision: Live chat directory remains single-target and group-disabled

**Date:** 2026-08-30

The contact/send redesign treats the directory as a live, scoped WAHA chat view,
not a persisted address-book roster. Group rows remain visible but unavailable,
with manual E.164 entry as the fallback. This supersedes stale wording
describing a future contacts+groups roster as a messageable feature.

**Amendment (2026-08-31):** Live WAHA (GOWS) returns linked-identity `@lid`
JIDs as the canonical chat id for verified individual numbers
(`checkExists` → `chatId: "<digits>@lid"`), and individual directory rows carry
their real phone inside the contact lookup's `@c.us` `id`. Individual `@lid`
rows are therefore selectable: the server derives the phone from the verified
contact `id`, resolution accepts the provider-verified `@lid` routing address,
and raw `@lid` or `@g.us` input from the browser is still rejected. The earlier
"`@lid` rows remain unavailable" rule is superseded by observed provider
behavior and explicit operator direction.

**Security Implications:** Raw provider chat IDs never authorize a send; the
existing server-side scope, consent, authorization, and safety gates remain
authoritative.

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
**Status:** Implemented, independently verified, and committed locally; final
plan gates and remote synchronization remain pending.

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

### Todo 12: authenticate all backup envelope metadata

**Date:** 2026-08-17

The backup ciphertext now contains a typed copy of the outer format, version,
account scope, and key metadata, and restore compares that authenticated record
with the outer JSON before returning payload rows. The existing AES-256-GCM
envelope API remains the cryptographic seam; the HTTP JSON field shape is
unchanged. The outer backup format version is now `2` because version-1
backups contain no authenticated copy of all required metadata and therefore
must fail closed rather than receive a compatibility exception.

### Todo 12: bounded relational backup transfer

**Date:** 2026-08-17

Backup table selection is an explicit descriptor allowlist. Export uses UUID
keyset pages and restore uses 250-row chunks within one transaction. Both paths
enforce a 10,000-row and 8 MiB transfer ceiling. Restore validates every
scope-bearing row and relational reference—including global connections,
scoped users/sessions/jobs, messaging safety, notifications, and audit
references—before any insert; conflict-tolerant replay is retained only after
that validation. Unknown table keys fail closed, and errors contain no row
contents or secrets.

### Todo 12: snapshot-consistent, page-bounded backup export

**Date:** 2026-08-17

Export descriptors and keyset pages execute inside one PostgreSQL repeatable-read,
read-only transaction. Each page first selects at most 100 IDs and server-computed
JSON byte lengths, accounting for array brackets and commas before fetching the
selected row JSON. An oversized first candidate fails before payload transfer;
the existing 10,000-row and 8 MiB total checks remain after payload parsing.
Real PostgreSQL integration tests cover a committed later-table row remaining
outside the snapshot and verify that an oversized row produces no payload query.

Page termination uses the number of metadata rows actually returned, not the
number of rows that fit the byte-budget prefix. This keeps keyset pagination
correct when a page is shortened by the 8 MiB limit while preserving the
fail-closed oversized-first-row check. The correction is committed as `1e32da0`
and verified against fresh PostgreSQL 17.6 databases.

The final review also required the users descriptor to include users referenced
only by `session_grants`; otherwise a valid scoped grant could export without its
parent user and fail restore validation in an empty database. Regression coverage
now verifies both export-page continuation and grant-only user restore. The
implementation and regression file are committed as `a69c248`.

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

## WAHA runtime configuration audit seam

**Date:** 2026-08-17

Runtime connection create/update emits `waha.connection_created` or
`waha.connection_updated` through an optional typed callback with the actor user
ID, `waha_connection` subject type, persisted opaque connection ID, and Personal
scope only. The callback has no details field, so API key, base URL, and name
cannot enter these events. `createApiApp` currently does not compose this
settings service, so central app wiring is intentionally deferred until a real
runtime route uses the seam.

## Protected-record closeout authorization

**Date:** 2026-08-19

The user explicitly authorized committing and pushing the remaining protected
plan/ledger updates and all verified evidence artifacts. The plan checkbox and
execution-ledger Todo 13 completion event were therefore preserved as focused
documentation commits rather than left as local-only changes. No protected
record was rewritten beyond the verified Todo 13 completion update.

Security-sensitive evidence was retained only in redacted or placeholder form;
the final credential-pattern scan found no credential-bearing database URLs or
private-key blocks in the committed state, plan, ledger, or evidence files. The
remaining verification blockers stay open and are not converted into completion
claims.

## Todo 15: Compose operations boundary and readiness semantics

**Date:** 2026-08-25

Compose operations use `docker-compose.yml` with `docker-compose.override.yml`
and exactly one of `docker-compose.external-waha.yml` or
`docker-compose.bundled-waha.yml`. Only web publishes a host port. API and
bundled WAHA remain internal. The API runs migrations before listening, and
Compose health dependencies establish startup ordering only; `/health` is not
WhatsApp linking or recipient-delivery proof.

Production Compose takes the encryption master key from the file named by
`ENCRYPTION_MASTER_KEY_FILE`; direct `ENCRYPTION_MASTER_KEY` is reserved for
deliberate non-Compose use, and both sources fail closed. PostgreSQL passwords
use a Docker secret file. Bundled WAHA session state is retained in
`waha-sessions:/app/.sessions` and is sensitive backup material.

Historical snapshot before the 2026-08-26 correction: the exact bundled image
had no registry manifest, and bundled Compose interpolated `WAHA_API_KEY` as a
plain environment value. That configuration was not approved for delivery and
is superseded by the fail-closed decision below. No replacement image or
undocumented WAHA secret-file behavior was authorized.

## Todo 15: Bundled WAHA must fail closed without a verified secret boundary

**Date:** 2026-08-26

WAHA's supported `WAHA_API_KEY` and `sha512:<hash>` configuration values are
credentials and must not appear in resolved Compose configuration or container
inspection. The exact source does not support Docker secret files or an
`*_FILE` variable. Until an image digest and runtime-tested wrapper or other
supported boundary are available, the bundled service exits before WAHA starts
and the external-WAHA Compose mode remains the only verified deployment path.

## Todo 7: reconcile operational documentation with verified Compose behavior

**Date:** 2026-08-27

Operational documentation must distinguish configuration validation from runtime
acceptance. External mode is verified only with disposable placeholder-provider
QA for PostgreSQL, API, web, migration ordering, readiness, same-origin proxying,
private API exposure, and non-root application UIDs. Bundled mode remains blocked
by the missing `devlikeapro/waha:2026.8.1` manifest and the absence of a verified
secret-file boundary, so no bundled health, linking, account safety, or delivery
claim is permitted. The README and runbooks use the pinned pnpm invocation and
retain the unofficial-client restriction and ban-risk warning.

## Todo 9: repository-local release verification evidence

**Date:** 2026-08-27

The release gate interface is four deterministic package commands backed by typed
boundary parsers: requirements mapping, secret scanning, scope fidelity, and
documentation structure/link checks. They use the pinned pnpm wrapper, return
exit 0 for the current repository, and return safe nonzero diagnostics for
temporary invalid inputs. Diagnostics contain rule/remediation information only,
never injected secrets, source content, absolute paths, or stack traces.

The focused release suite passed `13 files, 101 tests`, and its package manifest
test passed `5/5`. Temporary mutation roots are cleaned in test finally paths;
no external account, uncontrolled service, or external scanner is part of this
evidence. Todo 9, Todo 16, and F1-F4 remain open until their later independent
reconciliation gates are completed.

## Todo 15: digest-pinned bundled WAHA secret bridge

**Date:** 2026-08-28

The published WAHA image is `devlikeapro/waha:latest-2026.8.1`, pinned in
`Dockerfile.waha` to digest
`sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca`.
The dated `2026.8.1` tag has no manifest and is not used. Because the image does
not provide a native Docker-secret `_FILE` contract, bundled Compose uses a
repository-owned entrypoint wrapper that reads `/run/secrets/waha_api_key`,
exports `WAHA_API_KEY` only to the native child process, unsets the file-path
variable, and preserves `/usr/bin/tini -- /entrypoint.sh` startup.

The wrapper and authenticated internal healthcheck were exercised with a
disposable bundled Compose project; the focused Compose tests, full PostgreSQL
matrix, full Playwright suite, typecheck, build, and changed-file Biome checks
passed. This decision establishes an implementation/runtime boundary, not real
WhatsApp linking or recipient-delivery proof, and does not close protected plan
checkboxes or final release gates.

## Development workflow: focused feature mode and explicit release mode

**Date:** 2026-08-28

Ordinary feature work uses a required focused regression test plus the typed
`feature` command. The command validates `--test-file`, `--test-name`, and
`--paths`, then runs only focused Vitest, project typecheck, and scoped Biome. It
does not invoke E2E, full Vitest, repository-wide lint, dependency audit,
release scanners, scope checks, requirements checks, or documentation checks.

`dev:bundled` is the copyable local startup path for manual testing and uses an
isolated Compose project with the existing file-backed secret boundary.
`release` is the explicit aggregate validation path for release/final-gate work.
This speeds feature iteration without weakening authorization, scope, CSRF,
encryption, redaction, internal-WAHA, or no-delivery-claim requirements.
