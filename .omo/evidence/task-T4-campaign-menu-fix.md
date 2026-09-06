# Task T4 — Campaign DELETE endpoint for terminal campaigns

Date: 2026-09-05
Scope: Wave 4 of the campaign menu fix. `DELETE /scoped/campaigns/:id` now
removes a campaign row, but only when the caller is the creator and the
campaign is in a terminal state (`cancelled`, `sent`, `failed`). Scheduled
campaigns can never be deleted: the service throws bad-input before touching
the repository, and the repository `DELETE` itself carries the terminal-state
filter in its `WHERE` clause as defense in depth. Cross-user and cross-scope
access is denied with 403 without leaking row existence. Mutations require
same-origin + session + CSRF exactly like the other campaign mutations. No
ciphertext, nonce, or auth-tag material is exposed anywhere on the route
(the only response bodies are `{"ok":true}`, `{"error":"forbidden"}`,
`{"error":"invalid request"}`, or `{"error":"campaigns unavailable"}`).

## Changes

| File | Change |
| --- | --- |
| `apps/api/src/db/repositories/campaigns.ts` | New `remove(id, accountScope)`: `db.delete(campaigns)` scoped by `id` + `accountScope` + `state IN ('cancelled','sent','failed')` (drizzle `inArray`), `.returning({ id })`; returns `true` only when a row was deleted |
| `apps/api/src/campaigns.ts` | `CampaignRepository` type gains optional `remove(id, scope) => Promise<boolean>` (optional so out-of-scope fixtures keep compiling, mirroring `ContactGroupRepository.delete?`); service gains `remove(principal, id, scope)`: creator check (`CampaignForbiddenError`), terminal-state guard (`CampaignInputError` for `scheduled`), then repository remove; a `false` return (row vanished / left scheduled state concurrently) denies with `CampaignForbiddenError` |
| `apps/api/src/campaigns-http.ts` | `CampaignRouteService` gains optional `remove`; new `DELETE /scoped/campaigns/:id` route using `principalForMutation` (sameOrigin → 403, authenticate → 401, `verifyCsrf` → 403), `campaignParamsSchema` UUID param + `scopeQuerySchema` validation (400), `service.remove` absent → 503, `CampaignForbiddenError` → 403, `CampaignInputError` → 400, success → `{"ok":true}` (contact-groups delete response shape) |
| `tests/campaign-delete.test.ts` (new) | Service tests (terminal removal for cancelled/sent/failed, scheduled → `CampaignInputError` with repository untouched, cross-user → `CampaignForbiddenError` with no writes, concurrent-vanish race → forbidden), HTTP tests over `app.inject` (same-origin+CSRF happy path → 200 `{"ok":true}` with no ciphertext material; missing CSRF → 403 before service; cross-origin → 403 before service; cross-user → 403; scheduled → 400; malformed id → 400 via the app-level Zod handler; capability absent → 503), and a repository test over the fake drizzle db (`remove` true only when a scoped row is deleted) |

Preserved invariants: deny-by-default (unknown row, wrong scope, wrong user,
and replay deletes all deny with 403), creator scoping enforced server-side,
sameOrigin + CSRF on the mutation, message ciphertext never leaves the
persistence layer on this route. The linked `scheduled_jobs` row is
intentionally left in place: a deletable campaign's job is already terminal
(cancelled/submitted/failed), and job rows are delivery-evidence records —
same lifecycle reasoning as contact-group deletes.

## Verification 1 — RED then GREEN (focused feature gate)

Command:

```bash
npx --yes pnpm@10.12.4 feature \
  --test-file tests/campaign-delete.test.ts \
  --test-name "delete removes terminal campaigns" \
  --paths apps/api/src/db/repositories/campaigns.ts apps/api/src/campaigns.ts \
    apps/api/src/campaigns-http.ts tests/campaign-delete.test.ts
```

### RED (tests written first, before any source change; exit 1)

```text
FAIL  tests/campaign-delete.test.ts > campaign delete service > delete removes terminal campaigns
TypeError: context.campaigns.remove is not a function
 ❯ tests/campaign-delete.test.ts:107:29
Test Files  1 failed (1)
Tests  1 failed | 11 skipped (12)
ELIFECYCLE  Command failed with exit code 1.
```

RED for the right reason: neither the service nor the repository exposed
`remove`, and the HTTP route did not exist.

### GREEN (after source change; test + typecheck + scoped Biome pass)

```text
✓ tests/campaign-delete.test.ts (12 tests | 11 skipped) 4ms
Test Files  1 passed (1)
Tests  1 passed | 11 skipped (12)

> typecheck
> tsc -b --pretty false
(no errors)

> biome check (scoped)
Checked 4 files in 15ms. No fixes applied.
```

Full new suite plus pre-existing campaign suites (regression sweep):

```text
✓ tests/campaign-delete.test.ts (12 tests)        (incl. 6 HTTP + 2 repository tests)
✓ tests/campaign-cancel.test.ts (6 tests)
✓ tests/campaigns-http-regression.test.ts (6 tests)
✓ apps/api/src/campaigns.test.ts (3 tests)
Test Files  4 passed (4)
Tests  27 passed (27)   [24 across the three tests/ files + 3 in apps/api]
```

## Verification 2 — manual QA over HTTP (disposable dev stack)

The disposable `relaynest-dev` compose stack had its API rebuilt from this
working tree (`up -d --build api` on the
`docker-compose.yml + override + bundled-waha --profile waha` project);
the container came back healthy. Two throwaway QA operators were provisioned
directly in the disposable database (scrypt hashes generated with the
repository's own `apps/api/src/auth/password.ts`), each with an operator role
and a session grant on the pre-existing WORKING session
(`fdb277f2-…`, name `session-test`); the creator also owned a contact group.
All traffic went through the published dev web origin
(`http://127.0.0.1:38080`, which proxies `/auth` and `/scoped` to the internal
API) with an Origin header, session cookie, and `x-csrf-token`. Passwords,
cookies, and CSRF tokens were redacted and the artifacts removed after QA.
Baseline before QA: 6 campaigns, 11 scheduled_jobs, 1 contact group, 1 grant.

### Create, cancel (curl -i, tokens redacted)

```text
POST /scoped/campaigns?scope=personal  ->  HTTP/1.1 201 Created
  target A (id e5b8f10b-…) and survivor B (id 7e9e04f1-…), both
  state "scheduled", wahaGroupSubject "Product ber 4"
POST /scoped/campaigns/<A>/cancel?scope=personal
HTTP/1.1 200 OK
{"id":"e5b8f10b-…",…,"state":"cancelled","schedulerJobId":"99a6be9f-…",
 "messagePreview":"QA T4 delete target campaign",…}
```

### DELETE probes (curl -i, all through the web origin)

```text
1. DELETE <A>  creator, valid CSRF, same-origin
HTTP/1.1 200 OK
{"ok":true}

2. DELETE <A>  creator, NO x-csrf-token header
HTTP/1.1 403 Forbidden
{"error":"forbidden"}

3. DELETE <A>  creator, Origin: http://evil.example
HTTP/1.1 403 Forbidden
{"error":"forbidden"}

4. DELETE <B>  (still scheduled) creator, valid CSRF
HTTP/1.1 400 Bad Request
{"error":"invalid request"}

5. DELETE /scoped/campaigns/not-a-uuid  (malformed id)
HTTP/1.1 400 Bad Request
{"error":"invalid request"}

6. DELETE <A>?scope=business  (campaign lives in personal)
HTTP/1.1 403 Forbidden
{"error":"forbidden"}

7. DELETE <A>  as the second QA operator (same grant, NOT the creator)
HTTP/1.1 403 Forbidden
{"error":"forbidden"}

8. repeat of probe 1 (row already deleted)
HTTP/1.1 403 Forbidden
{"error":"forbidden"}
```

### Database state behind the responses (QA rows only)

```sql
-- after the successful delete
SELECT … FROM campaigns WHERE id = 'e5b8f10b-…';        -- 0 rows (removed)
SELECT … FROM campaigns WHERE id = '7e9e04f1-…';        -- 1 row, state scheduled (survivor intact)
SELECT count(*) FROM campaigns;                          -- 7 = 6 baseline + survivor B
SELECT j.state, (c.id IS NULL) AS campaign_row_gone
FROM scheduled_jobs j LEFT JOIN campaigns c ON c.scheduler_job_id = j.id
WHERE j.id = '99a6be9f-…';
-- cancelled | t   (A's terminal job row is intentionally retained as delivery evidence)
```

The targeted row was removed; every other campaign (including the 6 baseline
rows) remained untouched. No response body contained `ciphertext`, `nonce`,
or `authTag` material.

## Cleanup

- QA campaign B, its scheduled job, and A's retained terminal job row were
  deleted; campaigns (6), scheduled_jobs (11), contact_groups (1) returned to
  baseline.
- The QA session grants (2), user roles (2), and auth sessions (2) were
  deleted; counts returned to baseline.
- The two QA users remain as `active=false` rows with emptied password hashes
  because append-only `audit_entries` reference them (same policy as T1/T2);
  they hold no grants or roles and cannot authenticate.
- Cookies, CSRF tokens, and curl artifacts were removed from `/tmp/opencode`.
- The disposable dev stack is left running healthy (it was running before this
  task; its api image now matches this working tree).

## Notes and residual risk

- `remove` is optional on both the repository and route-service types so the
  three pre-existing `CampaignRepository` literals in out-of-scope test files
  (`tests/campaign-cancel.test.ts`, `tests/campaigns-http-regression.test.ts`,
  `apps/api/src/campaigns.test.ts`) keep compiling; the production repository
  always provides it and the route degrades to 503 if absent (established
  pattern of the other optional campaign capabilities).
- Terminal-state denial is enforced twice: service guard (`scheduled` → 400)
  and repository `WHERE state IN ('cancelled','sent','failed')`. A future new
  non-terminal state must be added to the repository filter deliberately.
- Deleting a campaign does not delete its terminal `scheduled_jobs` row or
  `dispatch_attempts` history; they are accountability records, consistent
  with the purge/retention model. If product later wants job rows reaped with
  the campaign, that is a separate retention decision.
- Shared dev-stack note: during QA an unrelated user/role/grant row appeared
  in the disposable database (another parallel wave task sharing the stack).
  It was left untouched; only rows created by this task's QA were removed.
- Commit intentionally not created (orchestrator commits after verification).
