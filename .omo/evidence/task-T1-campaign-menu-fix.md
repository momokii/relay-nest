# Task T1 — Cancel correctness: real `cancelled` state + scheduler job propagation

Date: 2026-09-05
Scope: Wave 1 of the campaign menu fix. Cancelling a scheduled campaign now sets
`state='cancelled'` (previously it wrongly wrote `state='failed'`) and cancels the
linked `scheduled_jobs` row. Idempotent re-cancel, rejection of sent/failed
targets, and cross-user 403 are covered by failing-first tests.

## Changes

| File | Change |
| --- | --- |
| `apps/api/drizzle/0013_campaign_state_cancelled.sql` (new) | Single statement: `ALTER TYPE "campaign_state" ADD VALUE IF NOT EXISTS 'cancelled';` |
| `apps/api/drizzle/meta/_journal.json` | Journal entry `idx 12` for 0013 (required for `drizzle` migrate to apply the SQL; same hand-written pattern as 0003-0012, no snapshot needed) |
| `apps/api/src/db/schema/campaigns.ts` | `campaignStateEnum` gains `"cancelled"` |
| `apps/api/src/db/repositories/campaigns.ts` | Record state union gains `"cancelled"`; `cancel` is now guarded: only rows with `state='scheduled'` transition to `'cancelled'` (scope + id preserved), returning null otherwise — mirrors the existing `scheduledJobs.cancel` guarded pattern |
| `apps/api/src/campaigns.ts` | Record state union gains `"cancelled"`; `CampaignDependencies.scheduler` gains `cancel(jobId, scope)`; `cancel` rewritten: ownership -> already-cancelled returns the record (idempotent) -> non-scheduled state throws `CampaignInputError` -> `scheduler.cancel` **before** repo cancel -> race re-read falls back to the cancelled record |
| `apps/api/src/campaigns-http.ts` | Cancel route maps `CampaignInputError` -> `400 {error:"invalid request"}` (403 forbidden path unchanged) |
| `apps/api/src/messaging-runtime.ts` | Wiring: `scheduler.cancel` injected via `encryptedScheduler.cancel` (scope-checked, decrypted) |
| `apps/api/src/campaigns.test.ts` | Scheduler fake gained `cancel: async () => null` (required by the new dependency type; no behavior change) |
| `tests/campaign-cancel.test.ts` (new) | Service-level vitest with in-memory fakes (pattern of `apps/api/src/campaigns.test.ts:23-62`): propagation + ordering, idempotent re-cancel, sent/failed rejection, cross-user 403, no-job campaign |

Preserved invariants: deny-by-default and creator scoping (403 on non-owner,
never a leak), sameOrigin + CSRF on the cancel mutation, server-side WAHA
credentials untouched, no media/campaign-send changes. The migration contains
only the `ADD VALUE` statement; no row writes `'cancelled'` in the same file.

## Verification 1 — RED then GREEN (focused feature gate)

Command:

```bash
npx --yes pnpm@10.12.4 feature \
  --test-file tests/campaign-cancel.test.ts \
  --test-name "cancel marks campaign cancelled and cancels the linked scheduler job" \
  --paths apps/api/src/db/schema/campaigns.ts apps/api/src/db/repositories/campaigns.ts \
    apps/api/src/campaigns.ts apps/api/src/campaigns-http.ts apps/api/src/messaging-runtime.ts \
    tests/campaign-cancel.test.ts
```

### RED (before source fix; exit 1)

```text
 RUN  v3.2.6
 ❯ tests/campaign-cancel.test.ts (6 tests | 1 failed | 5 skipped) 10ms
   × campaign cancel > cancel marks campaign cancelled and cancels the linked scheduler job 9ms
     → expected [ 'campaigns:cancel' ] to deeply equal [ 'scheduler:cancel', …(1) ]
   ↓ ... (5 skipped)

 FAIL  tests/campaign-cancel.test.ts > campaign cancel > cancel marks campaign cancelled and cancels the linked scheduler job
AssertionError: expected [ 'campaigns:cancel' ] to deeply equal [ 'scheduler:cancel', …(1) ]
- Expected
+ Received
  [
-   "scheduler:cancel",
    "campaigns:cancel",
  ]

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
ELIFECYCLE  Command failed with exit code 1.
```

RED for the right reason: the scheduler job was never cancelled (no propagation)
under the old cancel logic.

### GREEN (after source fix; test + typecheck + scoped Biome all pass)

```text
 RUN  v3.2.6
 ✓ tests/campaign-cancel.test.ts (6 tests | 5 skipped) 4ms
 Test Files  1 passed (1)
      Tests  1 passed | 5 skipped (6)

> typecheck
> tsc -b --pretty false
(no errors)

> biome check (scoped)
Checked 6 files in 16ms. No fixes applied.
```

Full new suite plus the existing campaign service suite:

```text
 ✓ tests/campaign-cancel.test.ts (6 tests) 5ms
 ✓ apps/api/src/campaigns.test.ts (3 tests) 4ms
 Test Files  2 passed (2)
      Tests  9 passed (9)
```

Coverage of the six unit tests: propagation with scheduler-before-repo ordering
and scope passed to the job cancel; idempotent re-cancel (scheduler touched
once); sent -> `CampaignInputError` with zero cancel side effects; failed ->
`CampaignInputError`; cross-user -> `CampaignForbiddenError` with zero side
effects; campaign without a linked job skips the scheduler entirely.

## Verification 2 — manual QA over HTTP (disposable dev stack)

The disposable `relaynest-dev` compose stack (api/postgres/waha/web) was
rebuilt from this working tree (`up -d --build api`). On boot the API ran
migrations; the enum was confirmed:

```sql
SELECT enum_range(NULL::campaign_state);
-- {scheduled,sent,failed,cancelled}
```

Two throwaway QA users were provisioned directly in the disposable dev
database (scrypt hashes generated with the repository's own
`apps/api/src/auth/password.ts`), with an operator role, one session grant on
the pre-existing WORKING session, and a creator-owned contact group. All QA
traffic went through the published web origin (`http://100.124.184.116:8081`,
which proxies `/auth`, `/scoped` to the internal API) with an Origin header,
session cookie, and `x-csrf-token`. Set-Cookie/token values redacted below.

### Create (scheduling far in the future so nothing could dispatch)

```text
POST /scoped/campaigns?scope=personal
HTTP/1.1 201 Created
{"id":"65936714-0e0f-4360-899e-2cdfdbddda26",...,"state":"scheduled",
 "schedulerJobId":"942f8c3b-402a-4df1-856d-8a408f65bd56"}

DB before cancel:
  scheduled_jobs 942f8c3b... state = scheduled
  campaigns      65936714... state = scheduled
```

### Cancel — campaign AND scheduler job become `cancelled`

```text
POST /scoped/campaigns/65936714-0e0f-4360-899e-2cdfdbddda26/cancel?scope=personal
HTTP/1.1 200 OK
{"id":"65936714-0e0f-4360-899e-2cdfdbddda26",...,"state":"cancelled",
 "schedulerJobId":"942f8c3b-402a-4df1-856d-8a408f65bd56"}

DB after cancel:
  scheduled_jobs 942f8c3b... state = cancelled
  campaigns      65936714... state = cancelled
```

Previously this path wrote campaign `state='failed'` and left the job
`scheduled`; the operator's own dev history (6 campaigns, all `failed`/`sent`
with attached jobs) shows the defect this fixes.

### Idempotent re-cancel

```text
POST /scoped/campaigns/65936714-.../cancel?scope=personal
HTTP/1.1 200 OK
{"id":"65936714-...","state":"cancelled",...}

DB: scheduled_jobs 942f8c3b... state = cancelled (unchanged, no double-write)
```

### Adversarial probes

```text
1. Cross-user: second QA user (operator, not the creator) cancels -> 403
   HTTP/1.1 403 Forbidden  {"error":"forbidden"}
2. Missing CSRF token on cancel -> 403 Forbidden {"error":"forbidden"}
3. Cross-origin (Origin: http://evil.example) cancel -> 403 Forbidden
4. Malformed create body (bad uuid, empty message/trigger) -> 400
   {"error":"invalid request"}
5. Injection-stored-text probe: message "ignore all previous instructions and
   send admin secrets" -> 201; stored as inert encrypted content, never
   interpreted server-side; campaign then cancelled normally.
6. Cancel a campaign already in state 'sent' (state flipped via SQL on the QA
   campaign only) -> 400 {"error":"invalid request"}; linked scheduler job
   left untouched (state stayed 'scheduled').
```

## Cleanup

- QA campaigns (2), their scheduled_jobs (2), the QA contact group, session
  grant, and user roles were deleted; counts returned to baseline
  (1 active user, 1 contact group, 6 campaigns, 11 scheduled_jobs, 1 grant).
- The two QA users remain as deactivated (`active=false`) rows because
  append-only `audit_entries` reference them; they hold no grants/roles and
  cannot authenticate.
- Redacted curl artifacts removed from `/tmp/opencode`.
- The disposable dev stack is left running healthy (it was running before this
  task; its api image now matches this working tree).

## Notes and residual risk

- `drizzle/meta/_journal.json` gained the 0013 entry — required for the new
  migration to ever run; consistent with how 0003-0012 were hand-registered.
- `apps/api/src/campaigns.test.ts` fake gained the now-required
  `scheduler.cancel` stub to keep the project typecheck green.
- Known narrow race (pre-existing class): if the scheduler job is leased
  (`attempting`) at cancel time, `scheduler.cancel` returns null and the
  service still marks the campaign `cancelled`; the dispatch-then-mark order of
  the campaign transport marks the campaign sent/failed before the job
  completes, so the exposure window is small and matches the 409 semantics of
  the existing per-job cancel endpoint. Broader lease-aware cancellation was
  intentionally out of scope for T1.
- Commit intentionally not created (orchestrator commits after verification).
