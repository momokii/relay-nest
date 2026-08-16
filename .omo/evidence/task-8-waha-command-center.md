# Todo 8 evidence: HMAC-validated WAHA webhook ingestion

Date: 2026-08-16

## Implemented

- Added scoped `POST /api/webhooks/waha/:accountScope/:sessionName` handling.
- Captures the exact raw request bytes before JSON parsing.
- Requires `X-Webhook-Request-Id`, millisecond `X-Webhook-Timestamp`,
  `X-Webhook-Hmac-Algorithm: sha512`, and a constant-time HMAC comparison.
- Computes HMAC as `HMAC-SHA512(secret, raw_body).hex`, matching the official
  WAHA contract.
- Enforces a five-minute replay window and configured event allow-list.
- Stores normalized event identity (`account_scope`, `session_id`, `event_type`,
  `provider_event_id`, `request_id`, `occurred_at`) with scoped unique request
  and provider-event constraints.
- Encrypts raw event bodies when the configured master key is available; the
  fallback stores only a non-reversible digest and never plaintext payload text.
- Applies monotonic message ACK transitions and PostgreSQL event-time guards for
  out-of-order session status events.
- Persists ACK transitions through an atomic database rank guard so concurrent
  API instances cannot downgrade a higher state; the production event insert and
  ACK update use one database transaction.
- Shares one consumer per registered HTTP route, so concurrent deliveries also
  preserve the in-process monotonic ACK guard; per-message update queues also
  serialize persistence. ACK rank advances only after durable state succeeds,
  and duplicate ACK deliveries retry a failed state side effect.
- Returns 202 for a new valid event, 200 for an idempotent duplicate, 401 for
  authentication/replay failure, and 400/503 for malformed/storage failures.
- Maps Fastify's webhook JSON parser failure to generic `400
  {"error":"invalid webhook body"}` without exposing parser codes or raw body
  text.
- Rejects webhook bodies larger than 1 MiB before retaining them for HMAC or JSON
  processing, with a generic 413 response.
- WebSocket delivery is not used by the durable ingestion path.
- `message.waiting` is allowlisted only with `engine: "WEBJS"`; its required `id`
  and documented typed fields are validated while engine-specific provider fields
  remain extensible. WPP/GOWS/NOWEB waiting events are rejected.
- `message.ack` requires the official `ack` range `-1..4` and matching
  `ackName` values (`ERROR` through `PLAYED`).

## Tests and checks

| Check | Result |
|---|---|
| `vitest run tests/waha-webhook.test.ts tests/waha-webhook-http.test.ts --retry=2` | PASS: 2 files, 15 tests; repeated twice |
| Unit-only suite excluding PostgreSQL integration tests | PASS: 12 files, 47 tests |
| Biome on changed webhook/app/test files | PASS |
| `biome check .` | PASS: 79 files checked |
| `tsc -b --pretty false` | PASS |
| esbuild API bundle | PASS: `/tmp/waha-command-center-api-task8.cjs` created and removed |
| Sensitive payload/log search in `apps/api/src/waha` | PASS: no matches |
| Full suite | Webhook tests PASS; 7 PostgreSQL integration tests fail before execution with unavailable local `kelanach` database credentials |
| Post-implementation quality review | Final focused review completed; ACK contract validation added afterward and rechecked locally |

## Local HTTP curl verification

A temporary Fastify harness used the real route adapter and was deleted after
the run. Exact HMACs were generated with:

```sh
printf '%s' "$body" | openssl dgst -sha512 -hmac 'task8-secret' -hex
```

Observed responses, including WEBJS waiting and malformed JSON:

```text
waiting       202  {"accepted":true}
duplicate     200  {"duplicate":true}
unsupported   400  {"error":"webhook rejected"}
bad-signature 401  {"error":"webhook rejected"}
stale         401  {"error":"webhook rejected"}
malformed     400  {"error":"invalid webhook body"}
oversized     413  {"error":"webhook body too large"}
```

The temporary store emitted exactly one normalized record:

```text
NORMALIZED personal message.waiting evt-waiting-curl
```

Malformed JSON with a valid body HMAC was rejected by the app-level Fastify
error mapping with HTTP 400; oversized bodies receive 413. Responses contained
neither parser details nor event text.

## PostgreSQL verification limitation

The full suite was also attempted. Webhook tests pass, while seven PostgreSQL
integration tests fail before execution because the local `kelanach` database
credentials are unavailable. The migration adds `request_id`, scoped uniqueness
constraints, and `sessions.status_occurred_at`; focused HTTP tests validate the
same idempotency and normalized-event seam.

## Scope and cleanup

- No `.omo` plan or ledger file was edited.
- No commit was created.
- Temporary PostgreSQL container, server, logs, bundle, and response artifacts
  were removed.
- The checkout is not a Git worktree, so dirty-worktree status could not be
  obtained with `git status`.
