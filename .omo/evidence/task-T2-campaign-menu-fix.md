# Task T2 — Display enrichment: group subject snapshot, message preview, timezone

Date: 2026-09-05
Scope: Wave 2 of the campaign menu fix. Every campaign response now carries the
display fields the menu renders: `wahaGroupSubject` (group name snapshot
captured server-side from the WAHA group listing at schedule time),
`messagePreview` (main message decrypted in memory and truncated to 120
characters), and `timezone` (joined from the linked `scheduled_jobs` row).
The legacy session-scoped create route now reuses `safeCampaign` instead of a
hand-rolled subset. No client-supplied group name is trusted; no ciphertext,
nonce, or auth-tag material ever reaches logs or responses.

## Changes

| File | Change |
| --- | --- |
| `apps/api/drizzle/0014_campaign_waha_group_subject.sql` (new) | Single idempotent statement: `ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "waha_group_subject" text;` |
| `apps/api/drizzle/meta/_journal.json` | Journal entry `idx 13` for 0014 (same hand-written pattern as 0003-0013; no snapshot needed) |
| `apps/api/src/db/schema/campaigns.ts` | Nullable `wahaGroupSubject` text column |
| `apps/api/src/db/repositories/campaigns.ts` | `safe(row, timezone)` now also decrypts the main message envelope in memory, truncates to 120 chars (`messagePreview`), and passes through `wahaGroupSubject`; `find`/`list` left-join `scheduled_jobs` on `scheduler_job_id` to surface `timezone`; `attachSchedulerJob` fetches the linked job's timezone so the create response already carries it; `create` persists `wahaGroupSubject` |
| `apps/api/src/campaigns.ts` | `schedule()` finds the matching WAHA group while validating `wahaGroupId` and snapshots its `name` into the create input (`wahaGroupSubject`, null when WAHA omits it); repository create input type gains the field; `CampaignRecord` gains optional `wahaGroupSubject`/`messagePreview`/`timezone` |
| `apps/api/src/campaigns-http.ts` | `safeCampaign` emits `wahaGroupSubject`, `messagePreview`, `timezone` (normalized with `?? null` so keys are always present in JSON); legacy `POST /scoped/sessions/:sessionId/campaigns` response reuses `safeCampaign` (previously an inline field subset) |
| `tests/campaigns-http-regression.test.ts` (new) | HTTP contract-shape tests over `app.inject` (list, create, detail, legacy route all expose the three fields; no `ciphertext`/`nonce`/`authTag` in bodies; null-safe shape for campaigns without a group), a service test proving the group name snapshot is captured from the WAHA listing (and null when unnamed), and repository tests over a fake drizzle db proving 120-char truncation, decryption, the timezone join, and `attachSchedulerJob` timezone fetch |

Preserved invariants: deny-by-default (403 paths unchanged), creator scoping
(`hasGrant` + `createdBy` checks untouched), sameOrigin + CSRF on mutations,
server-side WAHA credentials untouched, message ciphertext still encrypted at
rest (preview plaintext exists only in memory during `safe()`), no logging of
envelope material. Service-level `CampaignRecord` gained the new fields as
optional so existing out-of-scope fixtures keep compiling; the repository
always populates them and `safeCampaign` normalizes them to `null`.

## Verification 1 — RED then GREEN (focused feature gate)

Command:

```bash
npx --yes pnpm@10.12.4 feature \
  --test-file tests/campaigns-http-regression.test.ts \
  --test-name "campaign responses expose display fields" \
  --paths apps/api/src/db/schema/campaigns.ts apps/api/src/db/repositories/campaigns.ts \
    apps/api/src/campaigns.ts apps/api/src/campaigns-http.ts \
    tests/campaigns-http-regression.test.ts
```

### RED (source changes stashed, test in place; exit 1)

```text
RUN  v3.2.6
❯ tests/campaigns-http-regression.test.ts (6 tests | 1 failed | 5 skipped)
  × campaign display enrichment > campaign responses expose display fields
    → expected { id, accountScope, … } to match Object { wahaGroupSubject,
      messagePreview, timezone }
    - wahaGroupSubject / messagePreview / timezone keys absent from response
Test Files  1 failed (1)
Tests  1 failed | 5 skipped (6)
ELIFECYCLE  Command failed with exit code 1.
```

RED for the right reason: responses lacked all three display fields before the
source change.

### GREEN (after source fix; test + typecheck + scoped Biome pass)

```text
RUN  v3.2.6
✓ tests/campaigns-http-regression.test.ts (6 tests | 5 skipped) 109ms
Test Files  1 passed (1)
Tests  1 passed | 5 skipped (6)

> typecheck
> tsc -b --pretty false
(no errors)

> biome check (scoped)
Checked 5 files in 16ms. No fixes applied.
```

Full new suite plus the existing campaign suites (regression sweep):

```text
✓ tests/campaigns-http-regression.test.ts (6 tests) 77ms
✓ apps/api/src/campaigns-http.test.ts (4 tests) 79ms
✓ apps/api/src/campaigns.test.ts (3 tests) 3ms
✓ tests/campaign-cancel.test.ts (6 tests) 5ms
Test Files  4 passed (4)
Tests  19 passed (19)
```

## Verification 2 — manual QA over HTTP (disposable dev stack)

The disposable `relaynest-dev` compose stack (postgres/api/waha/web) had its
API rebuilt from this working tree (`up -d --build api`); migrations ran on
boot and `campaigns.waha_group_subject` was confirmed present. A throwaway QA
operator (own contact group, session grant on the pre-existing WORKING
session) was provisioned directly in the disposable database. All traffic went
through the dev web origin (`http://100.124.184.116:8081`, which proxies
`/auth` and `/scoped` to the internal API) with an Origin header, session
cookie, and `x-csrf-token`. Credentials, cookies, and tokens were redacted and
removed after QA. WAHA reported the group
`120363284412990889@g.us` with `name: "Product ber 4"`.

### Create via curl (message deliberately >120 chars)

```text
POST /scoped/campaigns?scope=personal  ->  HTTP 201
{
  "wahaGroupSubject": "Product ber 4",
  "messagePreview":   "QA display enrichment message. QA display enrichment
                       message. QA display enrichment message. QA display
                       enrichment messa",   // exactly 120 chars
  "timezone":         "Asia/Jakarta",
  "state":            "scheduled",
  "schedulerJobId":   "<job-id>"
}
Body contained no "ciphertext"/"nonce"/"authTag" substrings.
```

`wahaGroupSubject` came from the WAHA group listing (client never sent a name);
`timezone` is the default `Asia/Jakarta` stored on the linked scheduled job and
surfaced through the join.

### List and detail

```text
GET /scoped/campaigns?scope=personal        -> items[0] exposes all three fields
GET /scoped/campaigns/<id>?scope=personal   -> exposes all three fields
```

### Legacy route (now reusing safeCampaign)

```text
POST /scoped/sessions/<sessionId>/campaigns?scope=personal  ->  HTTP 201
{"wahaGroupSubject":"Product ber 4","messagePreview":"legacy route preview
 check","timezone":"Asia/Jakarta","createdBy":"<qa-user-id>", ...}
```

### Database state behind the responses (QA rows only)

```sql
SELECT c.waha_group_subject, length(c.message_ciphertext) > 0 AS encrypted_at_rest,
       j.timezone, j.state
FROM campaigns c JOIN scheduled_jobs j ON j.id = c.scheduler_job_id
WHERE c.created_by = '<qa-user-id>';
-- waha_group_subject | encrypted_at_rest | timezone     | state
-- Product ber 4      | t                 | Asia/Jakarta | scheduled
-- Product ber 4      | t                 | Asia/Jakarta | scheduled
```

Message ciphertext stays encrypted at rest; the preview is decrypted only in
memory per request. API request logs contain method/url only — no bodies, no
envelope material.

### Adversarial probes

```text
1. Cross-origin create (Origin: http://evil.example)      -> 403 {"error":"forbidden"}
2. Missing CSRF token on create                           -> 403 {"error":"forbidden"}
3. Malformed body (bad uuid, empty message, empty trigger)-> 400 {"error":"invalid request"}
4. Campaign create in ungranted business scope            -> 403 {"error":"forbidden"}
5. Injection-stored-text probe: the long stored message is inert encrypted
   content; it is returned only as a JSON-encoded preview and never
   interpreted server-side.
```

## Cleanup

- QA campaigns (2), their scheduled_jobs (2), the QA contact group, session
  grant, and user role were deleted; counts returned to baseline
  (6 campaigns, 11 scheduled_jobs, 1 contact group, 1 grant).
- The QA user row remains as `active=false` with an emptied password hash
  because append-only `audit_entries` reference it (same policy as T1); it
  holds no grants or roles and cannot authenticate.
- Cookies, CSRF tokens, request payloads, and other curl artifacts were
  removed from `/tmp/opencode`.
- The disposable dev stack is left running healthy (it was running before this
  task; its api image now matches this working tree).

## Notes and residual risk

- `messagePreview` truncation is a plain 120-character slice (no grapheme
  awareness); acceptable for a menu preview and matches the stated contract.
- `attachSchedulerJob` performs a second single-row select for the job
  timezone; negligible cost on the create path and keeps the 201 response
  complete without a client refetch.
- Campaigns without `wahaGroupId` legitimately return
  `timezone: null` (no scheduled job exists); the menu must render the null
  case, which the contract tests cover.
- Commit intentionally not created (orchestrator commits after verification).
