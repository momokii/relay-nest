# Todo 10 — Contact resolution and individual text sending evidence

Date: 2026-08-16

## Scope

Implemented only scoped contact resolution and one-time individual text
messaging. The flow rejects groups, broadcasts, campaigns, media, and raw WAHA
payloads. Existing scheduler/webhook state semantics remain authoritative:
`submitted` is transport acceptance; only webhook evidence advances a dispatch
to `acknowledged`.

## Red/green and characterization evidence

```text
./node_modules/.bin/vitest run tests/task-10-baseline.test.ts
Test Files 1 passed (1)
Tests 2 passed (2)

./node_modules/.bin/vitest run tests/messaging.test.ts
Red: failed because apps/api/src/messaging did not exist.
Green: Test Files 1 passed; Tests 4 passed.
```

The baseline locks the existing one-claim/one-transport scheduler behavior and
server-only WAHA client boundary before the Todo 10 changes.

## Focused verification

```text
DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/vitest run tests/messaging.test.ts tests/messaging-http.test.ts tests/messaging-safety.test.ts tests/scheduler.test.ts tests/waha-adapter.test.ts tests/waha-webhook.test.ts tests/waha-webhook-http.test.ts tests/messaging-postgres.integration.test.ts
Test Files 8 passed (8)
Tests 56 passed (56)

DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/vitest run tests/messaging.test.ts tests/messaging-http.test.ts tests/messaging-safety.test.ts tests/scheduler.test.ts tests/waha-adapter.test.ts tests/waha-webhook.test.ts tests/waha-webhook-http.test.ts tests/messaging-postgres.integration.test.ts
Test Files 8 passed (8)
Tests 56 passed (56)
```

Coverage includes formatted/manual phone normalization, invalid number before
WAHA, WAHA check-exists/contact projection, `@c.us` individual-only rejection,
safe HTTP response projection, CSRF/origin denial, consent and opt-out denial,
session readiness, timelock, capping, cooldown, quiet hours, pacing, daily
budget, burst, duplicate-content, provider timeout/unknown, immediate send,
future scheduling, duplicate command idempotency, and scheduler attempt state.

## Isolated PostgreSQL migration and repository QA

Started disposable PostgreSQL 16:

```text
docker run --rm -d --name task10-final-pg \
  -e POSTGRES_USER=<REDACTED> -e POSTGRES_PASSWORD=<REDACTED> \
  -e POSTGRES_DB=waha_command_center -p 55435:5432 postgres:16-alpine
```

Exact migration/replay commands:

```text
DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/drizzle-kit migrate --config drizzle.config.ts
DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/drizzle-kit migrate --config drizzle.config.ts
```

Both passed. The full PostgreSQL-backed suite was then run twice with the same
result:

```text
DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/vitest run
Test Files 21 passed | 1 skipped (22)
Tests 90 passed | 3 skipped (93)
```

Live schema assertion command:

```text
  "select table_name || ':' || string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name in ('scheduled_jobs','session_messaging_safety') group by table_name order by table_name;"
```

Returned `scheduled_jobs` `message_blind_index` plus encrypted message fields
and durable state/attempt columns; and `session_messaging_safety`
budget, pacing, burst, duplicate-window, quiet-hours, and cooldown columns.

## Mock-WAHA/API manual QA

```text
DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/vitest run tests/messaging.test.ts tests/messaging-http.test.ts tests/messaging-safety.test.ts tests/scheduler.test.ts tests/waha-adapter.test.ts tests/waha-webhook.test.ts tests/waha-webhook-http.test.ts tests/messaging-postgres.integration.test.ts
```

Result: 56/56 passed in each of two focused runs. The mock-WAHA capture asserted these exact requests:

```text
GET /api/contacts/check-exists?phone=%2B628123456789&session=personal
GET /api/personal/contacts/628123456789%40c.us
POST /api/sendText
```

The capture asserted `X-Api-Key` stayed server-side, only the provider message
ID crossed the adapter, and raw provider fields were absent from the result.
The API inject scenarios asserted valid immediate/scheduled response shapes and
cross-origin denial before service invocation. Both malformed immediate and
scheduled payloads returned exactly `{ "error": "invalid request" }` with no
Zod path, raw payload, secret, or service invocation.

The PostgreSQL regression created a job through the encrypted repository, then
replayed it through a second fresh encrypted repository and messaging service
using the same database and key. The original submitted result was returned and
the counted provider transport ran exactly once. The provider boundary remains a
deterministic test transport; no live WAHA account was contacted.

## Adversarial classes

- Invalid/manual malformed number: rejected before the provider call.
- Ungranted or cross-scope session: authorization returns a safe denial.
- Missing consent or opt-out: no scheduler/provider dispatch.
- Disconnected, capped, timelocked, cooldown, quiet-hours, pacing, daily-budget,
  burst, and duplicate-content gates: explicit recovery states.
- Provider timeout/network: scheduler keeps `unknown/provider_unavailable`.
- Duplicate idempotency command: existing durable job is reused; no second
  dispatch attempt.
- Denied decisions, gate blocks, and scheduler dispatch outcomes append
  content-free audit entries with scope/session/job identity only.
- HTTP submission: `submitted` only; webhook ACK remains the only path to
  `acknowledged`.

## Full verification

```text
DATABASE_URL=<REDACTED_DATABASE_URL> \
  ./node_modules/.bin/vitest run
Test Files 21 passed | 1 skipped (22)
Tests 90 passed | 3 skipped (93)

The complete suite passed twice with the same result.

./node_modules/.bin/biome check .
Checked 100 files. No fixes applied.

./node_modules/.bin/tsc -b --pretty false
exit 0

apps/api: ../../node_modules/.bin/tsc -p tsconfig.json --pretty false && \
  ./node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=cjs \
  --outfile=/tmp/task10-final-api.cjs
API bundle emitted successfully.

apps/web: ./node_modules/.bin/vite build
Web bundle emitted successfully.

npm exec --yes --package=pnpm@10.12.4 -- pnpm audit --audit-level=high
No known vulnerabilities found.

python3 scripts/check_waha_capability_matrix.py docs/waha-capability-matrix.md
WAHA capability matrix OK: docs/waha-capability-matrix.md (16 mandatory capabilities)

bun run .../scripts/typescript/check-no-excuse-rules.ts <changed TypeScript files>
No violations in 5 file(s).
```

## Cleanup receipt

```text
completed
rm -f /tmp/task10-final-api.cjs
rm -rf apps/web/dist
docker rm -f task10-final-pg
ss -ltn '( sport = :55435 )'
no listener
```

No container, process, port, temporary secret, message content, or build output
is intentionally retained.

## Risks

WAHA remains an unofficial transport. A submitted HTTP response is not proof of
recipient delivery; ambiguous provider outcomes remain visible as `unknown` and
require recovery rather than duplicate-prone automatic resend.
