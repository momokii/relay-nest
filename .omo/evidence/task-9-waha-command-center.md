# Todo 9 — Durable one-time scheduler evidence

Date: 2026-08-16

## Scope

Implemented only one-time PostgreSQL scheduling and dispatch state handling. No
recurring jobs, messaging/contact flows, notifications, retention, analytics, or
dashboard UI were added.

## Characterization and red/green evidence

- Baseline characterization added for existing `scheduledJobs.create/find` and
  account-scope behavior in `tests/repositories.integration.test.ts`.
- Red phase: `./node_modules/.bin/vitest run tests/scheduler.test.ts` failed at
  the new scheduler seam with `Cannot find module .../apps/api/src/scheduler`.
- Green phase: `./node_modules/.bin/vitest run tests/scheduler.test.ts` passed 7/7.

## Verification commands and results

```text
./node_modules/.bin/biome check .
Checked 88 files in 65ms. No fixes applied.

./node_modules/.bin/tsc -b --force --pretty false
passed (exit 0)

DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/vitest run
Test Files 16 passed | 1 skipped (17)
Tests 65 passed | 3 skipped (68)

DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./apps/api/node_modules/.bin/drizzle-kit migrate --config drizzle.config.ts
migrations applied successfully

DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/vitest run tests/repositories.integration.test.ts
Test Files 1 passed
Tests 9 passed

DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/drizzle-kit check --config drizzle.config.ts
Everything's fine

../../node_modules/.bin/tsc -b --force --pretty false && \
  ./node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=cjs \
  --outfile=dist/index.cjs
passed; API bundle emitted successfully

./node_modules/.bin/vite build
passed; web bundle emitted successfully

npm exec --yes --package=pnpm@10.12.4 -- pnpm audit --audit-level=high
No known vulnerabilities found
```

The unconfigured command `./node_modules/.bin/vitest run` was also executed and
failed only for integration tests because the repository default
`postgresql://localhost/waha_command_center` rejected the local user's password.
The same full suite passed against the isolated URL above.

## Adversarial coverage

- Timezone and malformed schedule validation, including invalid IANA timezone.
- Concurrent worker claims with `FOR UPDATE SKIP LOCKED`; one lease and one
  attempt are created.
- Cancellation after claim is rejected by the lease/state lock; edits are only
  allowed for unclaimed scheduled/queued jobs.
- Worker interruption/restart recovery changes expired attempting leases to
  visible `unknown/lease_expired`, never an automatic resend.
- Missed schedules become `unknown/missed_schedule` after the configured grace.
- Retryable failures use bounded exponential backoff; retry exhaustion is
  terminal `failed`.
- Timeout/network failures are `unknown/provider_unavailable`; 463 is
`failed/timelock_active`; 475 is `failed/session_capped`.
- Consent, disconnected-session, timelock, capping, and newly-linked cooldown
  gates return precise recovery codes without invoking transport.
- HTTP submission remains `submitted`; webhook acknowledgment advances it to
  `acknowledged` monotonically. No HTTP response is treated as recipient
  delivery.
- Unique `(job_id, attempt_number)` and idempotency key constraints prevent
  duplicate durable attempts.

## Real manual QA artifact

Disposable PostgreSQL 16 was started with:

```text
docker run --rm -d --name waha-scheduler-pg \
  -e POSTGRES_USER=<REDACTED> -e POSTGRES_PASSWORD=<REDACTED> \
  -e POSTGRES_DB=waha_command_center -p 55432:5432 postgres:16-alpine
```

After migration, the exact inline `tsx` DB-state QA command ran two concurrent
`claimDue` calls and printed:

```json
{"claimed":1,"attempts":1,"state":"attempting","attemptCount":1,"leaseOwner":"qa-worker-a"}
```

This confirms atomic claim, at-most-one attempt creation, attempt increment, and
durable lease ownership. Payload fields used in QA were literal `redacted`
placeholders.

## Cleanup receipt

```text
docker rm -f waha-scheduler-pg
completed
ss -ltn '( sport = :55432 )'
no listener
git status --short
only intended Todo 9 files and this evidence file remain
```

Build output directories were not retained as tracked/generated task artifacts.
No container, process, port, temporary QA file, secret, message content, or log
was left running or persisted by the QA run.

## Risks

- WAHA remains an unofficial transport; `unknown` is intentionally visible when
  the provider result is ambiguous and requires operator recovery.
- The scheduler service is exposed as a typed seam for Todo 10’s future text-send
  integration; this todo does not add a messaging route or contact resolver.
