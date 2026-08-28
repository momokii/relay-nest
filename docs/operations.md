# Operations Runbook

## Compose deployment modes

RelayNest supports the following Compose invocations. Run them from the
repository root with the required secret files present. The override file is
explicitly loaded below so the selected files are visible in the command. It
supplies the encryption secret path; the bundled overlay additionally supplies
the WAHA API-key secret path. Neither mode publishes API or WAHA ports.

### External WAHA, supported runtime

```bash
docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.external-waha.yml up --build --wait -d
```

`WAHA_BASE_URL` must point to the approved external service. The external WAHA
service is not created or exposed by this project. External mode remains the
provider-independent operational path. Its verification used a placeholder,
unavailable provider URL and therefore proves Compose ordering, health, proxy,
and exposure boundaries, not WhatsApp linking or delivery.

### Bundled WAHA, digest-pinned local runtime

```bash
docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.bundled-waha.yml --profile waha up --build --wait -d
```

The same production startup can be run through the deployment alias:

```bash
npx --yes pnpm@10.12.4 deploy:bundled
```

The disposable development stack uses a separate project name:

```bash
npx --yes pnpm@10.12.4 dev:bundled
```

Set `WAHA_API_KEY_FILE` to a protected file containing the approved WAHA API
key before running the command. The bundled service builds
`relaynest-waha:latest-2026.8.1` from `Dockerfile.waha`, whose base is the
published `devlikeapro/waha:latest-2026.8.1` image pinned to a recorded digest.
The dated `devlikeapro/waha:2026.8.1` reference has no registry manifest and is
not used. The repository wrapper reads the mounted secret and hands the value to
native WAHA startup without putting the key in Compose interpolation, resolved
configuration, or the healthcheck command.

The bundled smoke path is locally runtime-verified for image startup,
authenticated WAHA health, API/web readiness, internal-only ports, and session
volume wiring. It does not prove WhatsApp linking, account safety, or recipient
delivery. The earlier configuration-only until the image is available,
fail-closed blocker, and no supported secret-file mechanism statements are
historical release-gate records from before the published image and wrapper were
verified; they remain in the dedicated historical evidence files.

### File and port rules

`docker-compose.yml` is the base. A base-only command is useful for merged
configuration checks, but its default example URL is not an external provider
acceptance test. `docker-compose.external-waha.yml` requires
an external `WAHA_BASE_URL`. `docker-compose.bundled-waha.yml` changes the API
target to `http://waha:3000`, adds the `waha` health dependency, and enables the
`waha` profile. `docker-compose.override.yml` supplies the Compose encryption
secret path for local development.

Only `web` publishes a host port, `${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080}:4173`.
`api` exposes internal port `3000` only, and bundled `waha` exposes internal port
`3000` only. There is no host API or WAHA port. Remove any local guidance that
sets `API_PORT`; the container API port is fixed at `3000` and is not a host
setting.

The loopback bind is the safe default. Set `WEB_BIND_ADDRESS` to an explicit
trusted LAN or VPN address only when that boundary is intentional. A public
deployment requires a reverse proxy terminating HTTPS/TLS, strict firewall
rules, secure cookies and headers, and login rate limiting. Never place WAHA
directly on the public interface.

## Secrets and precedence

Production Compose reads the encryption key from the Docker secret file named
by `ENCRYPTION_MASTER_KEY_FILE`. The base Compose file requires that variable
and mounts the file at `/run/secrets/encryption_master_key`. The file must be
protected, owned by the deployment operator, and excluded from version control.

Direct `ENCRYPTION_MASTER_KEY` is supported only for deliberate non-Compose API
or test commands. It is not the production Compose source. The application
rejects configurations that provide both `ENCRYPTION_MASTER_KEY` and
`ENCRYPTION_MASTER_KEY_FILE`, and fails closed when the selected source is
missing or invalid. Never print, resolve, log, or commit key material.

Compose reads the PostgreSQL password from the Docker secret file at
`/run/secrets/postgres_password`, sourced from `POSTGRES_PASSWORD_FILE` (which
defaults to `.secrets/postgres_password`). The path may be configured, but the
password value must never appear in environment output, resolved configuration,
logs, evidence, or documentation.

Bundled Compose mounts the file named by `WAHA_API_KEY_FILE` at
`/run/secrets/waha_api_key`. The repository wrapper rejects an unreadable or
blank file with exit `78`, exports `WAHA_API_KEY` only for the native WAHA child
process, unsets `WAHA_API_KEY_FILE`, and preserves the native `tini` entrypoint.
The healthcheck reads the same mounted file locally and sends `X-Api-Key` to
loopback. The key value must never appear in Compose output, resolved
configuration, logs, evidence, user-facing responses, or documentation. It is
necessarily present in the native WAHA child process environment for the
duration of startup and runtime; restrict runtime inspection access accordingly.

## Startup, health, and readiness

The API applies Drizzle migrations before it calls `listen`. A new API container
therefore has a bounded period in which it is not listening. Its healthcheck
uses `/health` with a 30-second start period, then retries at bounded intervals.
PostgreSQL must be healthy before API startup. In external mode, web waits for a
healthy API. In bundled mode, API also waits for healthy `waha`, while `waha`
waits for healthy PostgreSQL. Web then waits for healthy API.

`/health` is readiness and liveness evidence for the API process and its
configured dependencies. It is not proof that a WhatsApp session is linked,
that WAHA reports `WORKING`, or that a recipient received a message. Check the
session state and delivery evidence separately, and preserve the uncertainty of
transport acceptance.

The verified external-mode QA started PostgreSQL, API, and web with the
external Compose files. All three became healthy; the web root returned HTTP
200; same-origin `/health` through the web proxy returned HTTP 200; API host
port metadata was absent; web was the only published port; and API/web ran as
UID 1000. This did not contact a real WAHA account or prove linking or delivery.

## WAHA session persistence and cleanup

Bundled WAHA stores session state in the named volume
`waha-sessions:/app/.sessions`. Treat this volume as sensitive: it can contain
linked-session material and must be included in the approved backup, access,
retention, and incident-response process. Do not copy it into evidence or
publish it.

Stop and remove only the named Compose project when cleaning a disposable run:

```bash
docker compose -p relaynest-task15 \
  -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.external-waha.yml down --remove-orphans
```

Use `down --volumes` only when the project-scoped disposable volumes are
explicitly approved for deletion. Never use broad `docker system prune`, and
never delete a retained production `waha-sessions` volume as routine cleanup.
After cleanup, inspect containers, volumes, and networks filtered by the exact
Compose project label. Leave unrelated WAHA, monitoring, database, and VPN
resources untouched.

## Encrypted backup and restore

The Admin-only endpoints are:

```text
POST /admin/backups/{scope}
POST /admin/backups/{scope}/restore
```

The backup contains scope-limited PostgreSQL rows, including encrypted records,
jobs, sessions, retention metadata, users/roles needed by the scope, and
content-free audit rows and session messaging safety settings. The format-2
payload metadata and rows are authenticated and encrypted with AES-256-GCM
using the configured master key. The response contains only the encrypted
envelope and non-secret key version/fingerprint metadata. It never returns the
master key or plaintext rows. Export is capped at 10,000 rows/8 MiB and restore
uses 250-row chunks after validating all relational scope references.

Restore fails closed on a missing/wrong/tampered key, malformed envelope,
unsupported table, invalid parent reference, or scope mismatch. Back up the
database and the sensitive `waha-sessions` volume through approved protected
storage before maintenance. Backup expiry is separate from live purge, and
purging live data does not remove external snapshots, archives, or session
volume copies.

## Key rotation

Key rotation is an offline maintenance operation, not a dashboard action.

1. Stop API/worker writes and confirm a tested backup exists, including the
   approved handling of WAHA session persistence.
2. Keep the old key available in the approved secret store. Do not put either
   key in shell history, logs, HTTP payloads, or repository files.
3. Run a controlled envelope re-encryption migration for every encrypted DB
   field, using the old key to decrypt and the new key to encrypt. Abort on any
   authentication failure; never replace an unreadable value with plaintext.
4. Re-encrypt the backup artifact with the new key and verify restore into an
   isolated PostgreSQL database, including Personal/Business boundaries.
5. Replace the Compose secret file, restart API/worker, and run focused
   encryption, backup, repository, and health checks.
6. Retire the old key only after restore and external backup-expiry checks pass.
   Record key version, fingerprint, operator, and timestamps, never key
   material.

A rotation without controlled re-encryption is unsupported and must fail closed.

## Retention and purge

Retention categories are `messages`, `contacts`, `events`, `notifications`,
and `audit`. Policies are scoped independently to Personal or Business. A
policy update changes metadata only; it never starts deletion.

1. Authenticate as an Admin in the target account scope.
2. `POST /admin/retention/{scope}/preview` with `{ "category": "messages" }`,
   including the authenticated session, CSRF token, and matching `Origin`.
3. Review the returned `cutoff`, `count`, and bounded `batchSize`.
4. Cancel by taking no further action. Cancellation has no database effect.
5. Confirm with `POST /admin/retention/{scope}/purge`, repeating the category,
   cutoff, preview count, and server-issued `previewToken` with
   `confirmed: true`.

The server rejects missing confirmation, stale preview counts, malformed input,
cross-scope requests, non-Admin roles, foreign origins, and missing CSRF proof.
Each transaction selects at most 100 eligible parent records and deletes their
dependent dispatch rows in the same transaction. Repeating the operation is
safe and converges toward zero. The `audit` category is intentionally
non-destructive: content-free accountability rows are never purged.

## Unofficial-client risk

WAHA uses an unofficial reverse-engineered WhatsApp client. Restriction and ban
risk is real and cannot be eliminated by pacing, budgets, quiet hours,
duplicate/burst protection, cooldowns, timelocks, capping, or approval gates.
RelayNest does not support scraping, spam, stealth, anti-detection, ban evasion,
broadcasts, campaigns, autonomous sending, or real-delivery claims. Operators
must use consent-first individual text workflows and treat transport acceptance
and WAHA `WORKING` as non-delivery evidence.
