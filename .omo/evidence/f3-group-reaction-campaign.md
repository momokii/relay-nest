# F3 — agent-executed browser/API QA: group-reaction-campaign

## Verdict

**FAIL / blocked for final acceptance.** The disposable API and WAHA containers
were healthy, but no authenticated RelayNest session, linked WhatsApp session,
or contact-group database credentials were available. Playwright could not
start because the configured Chrome binary is absent. Consequently, the
required authenticated happy-path browser/API flows cannot be claimed.

No secrets, real recipients, or real campaign content were recorded.

## Agent-executed captures

### CURL CAPTURE — live loopback and WAHA failure probes

Exact invocation:

```text
set +e; { ... curl -sS -i --globoff 'http://127.0.0.1:3000/scoped/campaigns?scope=personal'; ...; docker compose -p relaynest-dev exec -T waha sh -lc 'curl -sS -i http://127.0.0.1:3000/api/personal/groups'; ...; } | tee /tmp/qa-f3-curl.txt
```

Full headed command/response capture: `/tmp/qa-f3-curl.txt`.

Observed results:

- `GET /scoped/campaigns?scope=personal`: HTTP 302 to `/login`.
- `POST /scoped/campaigns?scope=personal` with `{}`: HTTP 302 to `/login`.
- `POST /api/webhooks/waha/personal/qa-f3` with `{}`: HTTP 401.
- WAHA `GET /api/personal/groups` without a key: HTTP 401.
- WAHA `POST /api/personal/groups` without a key: HTTP 401.

Machine-readable receipt: `/tmp/qa-f3.json`.

### PLAYWRIGHT CAPTURE — browser startup

Exact agent invocation: Playwright MCP `browser_tabs` with
`{"action":"list"}`.

Observed result: blocked before navigation:
`Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`.
The required headed Playwright browser run therefore has no success artifact.

## Component matrix

| Component | Happy QA | Failure QA | Evidence and status |
| --- | --- | --- | --- |
| Group create | **Not verified**: no authenticated linked WAHA session; prior direct probe reports `Session "personal" does not exist`. | **PASS**: unauthenticated WAHA create returned HTTP 401; invalid RelayNest access is covered by `groups.test.ts`. | `/tmp/qa-g1.json`, `/tmp/qa-f3-curl.txt`; happy path blocked. |
| Group list | **Not verified**: no linked WAHA session. | **PASS**: unauthenticated WAHA list returned HTTP 401; malformed/missing send-scope cases are covered by `apps/api/src/waha/groups.test.ts`. | `/tmp/qa-g1.json`, `/tmp/qa-f3-curl.txt`; happy path blocked. |
| Group add participant | **Not verified**: no linked WAHA session or group id. | **PASS (unit/API contract)**: `apps/api/src/waha/groups.test.ts` covers request path and missing `send` scope; live WAHA access returned HTTP 401. | `/tmp/qa-f3-tests.txt`, `/tmp/qa-f3-curl.txt`; live happy path blocked. |
| Contact-group reuse | **Not verified**: no authenticated HTTP route/runtime database fixture. | **BLOCKED**: the agent-executed repository tests failed at PostgreSQL authentication (`password authentication failed for user "kelanach"`), before assertions. | `/tmp/qa-f3-tests.txt`; prior `/tmp/qa-g2.json` was not created. |
| Campaign schedule | **Not verified**: live create was redirected to login (HTTP 302); no campaign was created. | **PASS**: unauthenticated list/create returned HTTP 302; focused `campaigns-http.test.ts` covers invalid/forbidden behavior. | `/tmp/qa-f3-curl.txt`, `/tmp/qa-g3.json`, `/tmp/qa-g5.json`, `/tmp/qa-f3-tests.txt`; happy path blocked. |
| Reaction → follow-up | **Not verified live**: no live authenticated campaign/linked WAHA delivery. | **PASS**: malformed/unauthenticated webhook returned HTTP 401; focused trigger/webhook tests cover non-member suppression, duplicate idempotency, quiet-hours denial, bad HMAC, stale replay, and scope rejection. | `/tmp/qa-f3-curl.txt`, `/tmp/qa-g4.json`, `/tmp/qa-f3-tests.txt`; live happy delivery blocked. |

## Exact focused test invocation

```text
npx --yes pnpm@10.12.4 exec vitest run apps/api/src/waha/groups.test.ts apps/api/src/contact-groups.test.ts apps/api/src/campaigns.test.ts apps/api/src/campaigns-http.test.ts apps/api/src/campaigns/reaction-trigger.test.ts apps/api/src/webhook-reaction.test.ts
```

Capture: `/tmp/qa-f3-tests.txt`.

Result: 17 tests passed across group, campaign, HTTP campaign, reaction-trigger,
and reaction-webhook suites; 3 contact-group repository tests were blocked by
the configured PostgreSQL authentication failure. This is regression/unit
evidence, not a substitute for the requested authenticated browser/API happy
paths.

## Acceptance gate

F3 is not green. Re-run with a disposable authenticated RelayNest user, a
granted Personal or Business session, a linked WAHA session/group, seeded
contact-group membership, and an installed headed Chromium. Capture both
success and expected-failure responses for every row above before accepting
the feature.
