# Threat Model

## Scope and assumptions

This model covers the MVP self-hosted, single-tenant command center with
multiple users, Personal and Business account scopes, one WAHA connection
profile, and multiple WAHA sessions. The dashboard may be reachable on a
trusted LAN/VPN. WAHA is an unofficial reverse-engineered WhatsApp client, so
account restriction or banning remains residual risk even when controls pass.

The primary assets are WAHA credentials, session access, message and contact
content, notification secrets, AI inputs and outputs, schedules, delivery
evidence, audit records, and retention/deletion metadata.

## Trust boundaries

1. **Browser to dashboard:** browser input, cookies, headers, and displayed
   content are untrusted. Authorization is enforced server-side.
2. **Dashboard to WAHA:** WAHA credentials remain server-side; the browser never
   receives a master key or unrestricted WAHA endpoint launcher.
3. **WAHA webhooks to dashboard:** webhook requests are untrusted until
   authenticated, fresh, well-formed, and deduplicated.
4. **Personal to Business:** account scopes are separate trust domains even
   though one tenant contains both.
5. **Application to providers:** SMTP, Telegram, and opt-in AI providers receive
   only the minimum approved data for their enabled feature.
6. **Live data to retention and backups:** purge and backup expiry are distinct;
   deletion policy changes are not deletion commands.

## Threats and controls

### Dashboard exposure

**Threat:** A dashboard is intentionally rebound from its loopback default to an
untrusted network, or public deployment is exposed without transport and
perimeter hardening. An attacker could attempt authentication, session control,
message sending, or data access.

**Controls:** Bind the dashboard to loopback by default. An explicit
`WEB_BIND_ADDRESS` override is for a trusted LAN/VPN boundary only.
Public deployment requires a reverse proxy with HTTPS/TLS, firewall restrictions,
hardened cookies and security headers, authentication, CSRF protection, and
login rate limiting. Do not publish bundled WAHA or its API port. Verify
unauthenticated routes, rate limits, secure cookies, and denial of cross-scope
requests.

Compose publishes only the web port. API and bundled WAHA use internal
container ports, so a host firewall and reverse proxy must expose the dashboard
without bypassing the same-origin API boundary.

### Compose runtime boundary

The base Compose file uses a digest-pinned PostgreSQL image and digest-pinned
Node application images. PostgreSQL must become healthy before the API starts;
the API applies migrations before listening; and web waits for a healthy API.
Bundled mode adds a healthy-WAHA dependency and uses the digest-pinned
`latest-2026.8.1` image through the repository-owned secret wrapper. Only web
publishes the configurable host port. API and bundled WAHA expose port `3000`
only inside the Compose network.

External mode is verified with disposable placeholder-provider QA. That evidence
proves service ordering, API readiness, same-origin proxying, private API
exposure, and non-root API/web UIDs. Bundled smoke QA additionally proves
service startup and authenticated health. Neither mode proves WhatsApp linking,
account health, or recipient delivery. The dated bundled image reference
`devlikeapro/waha:2026.8.1` has no registry manifest; the published
`latest-2026.8.1` image and its runtime secret wrapper are the supported bundled
deployment boundary.

### WAHA credentials

**Threat:** A browser payload, URL, log, error, backup, or response leaks the
WAHA master key or session-scoped credentials, enabling control outside the
command center.

**Controls:** Keep credentials server-side and encrypted at rest; inject them at
runtime; redact errors and logs; never place them in browser state, bundles,
URLs, fixtures, or ordinary responses. Restrict dangerous infrastructure
operations to Admins and expose only typed, bounded capabilities. Test response,
log, and browser-network redaction.

Production Compose reads the encryption master key from the file named by
`ENCRYPTION_MASTER_KEY_FILE`; direct key injection is for deliberate non-Compose
use only, and both sources together fail closed. PostgreSQL passwords use a
Docker secret file. Bundled Compose mounts the WAHA API key as a Docker secret;
the repository wrapper validates it, exports it only to the native WAHA child
process, and exits before startup when the file is unreadable or blank. No
provider key is placed in Compose interpolation or browser-visible state.

### Webhook spoofing and replay

**Threat:** An attacker submits forged or replayed webhook events to mark a
message acknowledged, alter session state, or create false audit/analytics
records.

**Controls:** Validate the WAHA HMAC signature and timestamp, reject malformed
or stale requests, require event/request identifiers, deduplicate accepted
identifiers, and handle out-of-order events deterministically. Store only
redacted normalized event data according to retention. Test invalid signatures,
stale timestamps, duplicate events, malformed payloads, and reordered events.

### Duplicate sends

**Threat:** A worker restart, timeout, retry, concurrent claim, or ambiguous WAHA
response causes the same message to be sent more than once.

**Controls:** One-time schedules use durable state, explicit timezone,
transactional lease/idempotency protection, bounded retries, and cancellation or
edit locks before dispatch. `attempting`, `submitted`, `acknowledged`,
`failed`, and `unknown` remain distinct. No unbounded retry or automatic retry
may assume that an ambiguous submission was never sent. Test restart-before-send,
lease recovery, timeout, retry exhaustion, and duplicate worker claims.

### AI leakage and unauthorized AI sending

**Threat:** Sensitive message/contact/session data is sent to an external AI
provider without permission, or an AI output causes an autonomous or
cross-scope send.

**Controls:** AI processing is opt-in per feature/session and provider-agnostic;
minimize and scope data before external processing; encrypt AI data; redact
secrets; preserve Personal/Business isolation in AI context. AI is limited to
summaries, classification, and draft suggestions in the MVP. Human approval is
required for every send, and autonomous replies/sending are excluded. Test
provider-disabled, cross-scope, and unapproved-draft paths.

### Cross-session and cross-account access

**Threat:** A user reads or mutates an ungranted session, or Personal data is
   exposed through Business navigation, queries, analytics, AI context,
retention, exports, or audit views. A Viewer or Operator may gain Admin-only
capabilities.

**Controls:** Default-deny server-side authorization combines role and explicit
per-session grant. Personal and Business are hard-separated across every query,
command, projection, context, retention operation, export, and audit view. Admin
creates users; there is no public registration. Test Admin/Operator/Viewer
matrices, denied mutation, disabled users, and cross-scope requests with safe
responses that reveal no sensitive data.

### Retention and purge

**Threat:** A retention-policy edit silently deletes data, a purge deletes the
wrong scope/category, deletion removes all accountability, or expired backups
retain sensitive records indefinitely.

**Controls:** Retention is configurable per category by Admin; policy changes
alone never delete. Purge requires a preview/count and explicit confirmation,
then targets only the selected scope/category. Keep minimal content-free
deletion audit metadata. Give backups their own expiry and document that purge
does not promise instant removal from existing backups. Test cancellation,
wrong-scope selection, policy-only changes, audit preservation, and backup
expiry/restore behavior.

### Notification secrets

**Threat:** SMTP passwords, Telegram bot tokens, or chat IDs leak to non-Admins,
logs, test sends, browser storage, or provider error messages. Notifications may
also become an unintended data exfiltration path.

**Controls:** Email and Telegram are independently enabled. Store configuration
encrypted and expose it only to Admins in masked form; redact history and
errors; provide explicit test-send controls; send only approved categories;
retain in-app failure history. Disabled channels make no outbound attempt.
Test non-Admin reads, malformed provider responses, timeouts, retries, and
redaction.

### Unofficial-client ban risk

**Threat:** WAHA's reverse-engineered WhatsApp client triggers account
restriction or banning, particularly through spam-like volume, scraping,
stealth, or anti-detection behavior.

**Controls:** The MVP is consent-first and text-only for individual recipients.
Enforce hard pacing/budgets, quiet hours, duplicate-content and burst
protection, newly-linked cooldowns, timelock/capping gates, and batch approval.
Do not implement scraping, spam, stealth, ban evasion, broadcasts, campaigns, or
autonomous sending. Display the residual risk prominently; no control promises
account safety.

Operators must not use unofficial clients for scraping, spam, broadcasts,
stealth, anti-detection, or ban evasion. No Compose health result, WAHA
`WORKING` state, HTTP acceptance, or transport acknowledgment is recipient
delivery proof.

## Residual risk and verification boundary

This document defines controls and required tests, not a claim that the future
implementation is secure. Public-internet deployment, exact provider behavior,
backup destruction guarantees, and WhatsApp enforcement remain residual risks.
Every implementation task must preserve precise delivery uncertainty, scoped
authorization, secret redaction, and visible recovery outcomes.
