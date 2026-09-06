# group-reaction-campaign - Work Plan

## TL;DR (For humans)

**What you'll get:** A new Campaign menu where you create reusable contact groups, schedule a message to a WAHA group, and automatically send a 1:1 follow-up to anyone who reacts (any emoji, immediate).

**Why this approach:** Reuse WAHA's native groups/reactions (`POST /api/{session}/groups`, `PUT /api/reaction`, `message.reaction` webhook) and keep app-owned `contact_groups` + `campaigns` tables — no new WAHA-managed contact store, scope + `hasGrant` before any decrypt.

**What it will NOT do:** No media/campaigns beyond group text, no broadcast without trigger, no cross-scope leakage, no WAHA credential exposure.

**Effort:** Large
**Risk:** High - touches WAHA group APIs, encrypted campaign storage, and webhook-driven dispatch
**Decisions to sanity-check:** Any-emoji immediate follow-up (reversible to per-emoji/delayed); group creation allowed from app; Campaign menu separate from Send/Schedule.

Your next move: approve to start work, or run dual high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Large, High risk, WAHA groups + app-owned contact groups + reaction-triggered 1:1 follow-up

## Scope
### Must have
- G1 WAHA groups: `POST /api/{session}/groups` (create), `GET /api/{session}/groups` (list), `POST .../participants/add|remove`, scoped `send` key, all engines (Store note for NOWEB).
- G2 Contact groups: app-owned `contact_groups` + `contact_group_members` (groupId, contactId/phoneCiphertext, scope), reusable across campaigns, scoped + hasGrant, encrypted phone if needed.
- G3 Campaigns: `campaigns` table (id, scope, sessionId, groupId, wahaGroupId, message, followUpMessage, trigger {any}, scheduledAt, state, createdBy), schedule group message via existing scheduler/WAHA.
- G4 Reaction trigger: extend webhook config to `message.reaction`, store `normalized_events`, match reactor in campaign's contact group, check consent/safety, send immediate 1:1 via `sendText` with audit, dedupe per (campaign, reactor, messageId).

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No media, no broadcast without explicit reaction trigger, no autonomous sending, no scraping/spam, no WAHA credential exposure, no cross-scope/cross-session leakage, no unbounded reads, no contenteditable beyond textarea, no inbox sync beyond reaction.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + Vitest + Playwright
- Evidence: .omo/evidence/task-<N>-group-reaction-campaign.md
- Unit: Vitest for group client, campaign repo, reaction matcher
- API: Vitest for scoped group/campaign CRUD, reaction ingestion, trigger dispatch (grant/scope/consent)
- UI: Playwright headed for Campaign menu, group create, add contacts, schedule, reaction → follow-up

## Execution strategy
### Parallel execution waves
- Wave 1: G1 WAHA group client + G2 contact-groups schema (parallel)
- Wave 2: G3 campaigns table + webhook reaction subscription (depends G1,G2)
- Wave 3: Campaign CRUD API + Reaction matcher service (depends G3)
- Wave 4: Campaign UI (menu, group picker, schedule, trigger config) + Trigger dispatch wiring (parallel, depends G3)
- Final: F1-F4 verification (parallel)

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| G1 | - | G3 | G2 |
| G2 | - | G3 | G1 |
| G3 | G1, G2 | G4, G5, G6 | - |
| G4 | G3 | G6 | G5 |
| G5 | G3 | G6 | G4 |
| G6 | G4, G5 | Final | - |
| G7 | G4, G5 | Final | G6 |
| F1-F4 | All | - | each other |

## Todos
- [x] G1. WAHA group client: create/list/add/remove participants
  What to do / Must NOT do: Add `apps/api/src/waha/groups.ts` and extend `session-adapter.ts`/`waha-contracts` with `POST /api/{session}/groups`, `GET .../groups`, `POST .../participants/add|remove`, `PUT /api/reaction` if needed; typed schemas, `send` scope, engine caveats. Must NOT expose `X-Api-Key` to browser nor use deprecated `POST /api/reaction`.
  Parallelization: Wave 1 | Blocked by: - | Blocks: G3
  References: docs/waha-capability-matrix.md:108, apps/api/src/waha/session-adapter.ts:128, apps/api/src/waha/session-types.ts:102
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/waha/groups.test.ts` passes with mocked WAHA for create/list/add; `npx --yes pnpm@10.12.4 typecheck` passes.
  QA scenarios: Vitest happy: create group returns `@g.us`; failure: 403 without `send` scope; Evidence .omo/evidence/task-1-group-reaction-campaign.md
  Commit: Y | feat(waha): add group client for create/list/participants

- [x] G2. Contact groups: app-owned groups for campaign targeting
  What to do / Must NOT do: Create `apps/api/src/db/schema/contact-groups.ts` with `contact_groups` (id, scope, name, createdBy, createdAt) and `contact_group_members` (groupId, contactId/phoneCiphertext, scope); repo with `hasGrant` + scope before decrypt; reuse contacts across groups. Must NOT store plaintext phone without encryption where required nor allow cross-scope reads.
  Parallelization: Wave 1 | Blocked by: - | Blocks: G3
  References: apps/api/src/db/schema/scheduling.ts:6, apps/api/src/db/schema/shared.ts, CONTEXT.md:55
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/contact-groups.test.ts` passes: Personal sees only own groups, Business denied, member add/remove scoped.
  QA scenarios: Vitest happy: create group + add 2 contacts → list returns 2; failure: cross-scope add returns 403/empty; Evidence .omo/evidence/task-2-group-reaction-campaign.md
  Commit: Y | feat(db): add contact groups for campaigns

- [x] G3. Campaigns table and scheduling to group
  What to do / Must NOT do: Create `apps/api/src/db/schema/campaigns.ts` with `campaigns` (id, scope, sessionId, groupId, wahaGroupId, message, followUpMessage, trigger {type: any, emojiMap?}, scheduledAt, state, createdBy); service to schedule group message via WAHA `sendText` to `@g.us` at `scheduledAt` using existing scheduler; state `scheduled|sent|failed`. Must NOT allow scheduling to non-granted session/group nor expose plaintext beyond scope.
  Parallelization: Wave 2 | Blocked by: G1, G2 | Blocks: G4, G5, G6
  References: apps/api/src/scheduler/database.ts:84, apps/api/src/messaging.ts:108, docs/waha-capability-matrix.md:108
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/campaigns.test.ts` passes: schedule to group creates job with `scheduled`, wrong scope 403.
  QA scenarios: Vitest happy: schedule group message; failure: past `scheduledAt` → 400; Evidence .omo/evidence/task-3-group-reaction-campaign.md
  Commit: Y | feat(api): add campaigns for group scheduling

- [x] G4. Reaction webhook ingestion
  What to do / Must NOT do: Extend `apps/api/src/waha/sessions.ts:237` webhook config to include `message.reaction`, ensure `apps/api/src/waha/webhook.ts:9` allowlist and `webhook-http.ts:74` raw HMAC path store to `normalized_events` (encrypted). Must NOT trust client scope, must verify HMAC/sha512 + 5m replay window.
  Parallelization: Wave 2 | Blocked by: G1, G2 | Blocks: G6
  References: apps/api/src/waha/webhook.ts:9,204, apps/api/src/waha/sessions.ts:237, apps/api/src/waha/webhook-http.ts:74
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/webhook-reaction.test.ts` passes: valid `message.reaction` stored encrypted, duplicate `providerEventId` idempotent, bad HMAC 401, replay outside 5m 401.
  QA scenarios: Vitest happy: reaction stored; failure: bad HMAC rejected; Evidence .omo/evidence/task-4-group-reaction-campaign.md
  Commit: Y | feat(waha): ingest message.reaction webhooks

- [x] G5. Campaign CRUD API
  What to do / Must NOT do: Add `GET/POST /scoped/campaigns`, `GET /scoped/campaigns/:id`, `POST /scoped/campaigns/:id/cancel` in `apps/api/src/campaigns-http.ts` with `authenticate` + `hasGrant` before any decrypt, scope from server, pagination 20/50, canonical states. Must NOT expose ciphertext, provider keys, nor allow cross-scope.
  Parallelization: Wave 3 | Blocked by: G3 | Blocks: G6
  References: apps/api/src/scheduled-http.ts:57, apps/api/src/app.ts:118, apps/api/src/waha/session-types.ts:70
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/campaigns-http.test.ts` passes: Personal sees own, Business empty, pageSize 100 capped, Viewer without grant 403.
  QA scenarios: Vitest happy: create → list ordered DESC; failure: cross-scope 403; Evidence .omo/evidence/task-5-group-reaction-campaign.md
  Commit: Y | feat(api): add scoped campaign CRUD

- [x] G6. Reaction → 1:1 follow-up trigger
  What to do / Must NOT do: Create `apps/api/src/campaigns/reaction-trigger.ts` that on `message.reaction` (any emoji) checks reactor `participant` is in campaign's contact group, checks consent/safety via `messaging-safety`, then sends immediate 1:1 `sendText` with audit and dedupe key `(campaignId, reactor, reactionMessageId)`, respects `quietHours/pacing/capping`. Must NOT send if reactor not in group or consent missing.
  Parallelization: Wave 4 | Blocked by: G4, G5 | Blocks: Final
  References: apps/api/src/messaging-safety.ts:49, apps/api/src/messaging.ts:186, apps/api/src/waha/webhook.ts:265
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/campaigns/reaction-trigger.test.ts` passes: reaction from member → 1:1 sent, non-member → no send, duplicate reaction idempotent.
  QA scenarios: Vitest happy: member reacts → follow-up `submitted`; failure: non-member reacts → no dispatch; Evidence .omo/evidence/task-6-group-reaction-campaign.md
  Commit: Y | feat(api): trigger 1:1 follow-up on group reaction

- [x] G7. Campaign UI: menu, group picker, schedule, trigger config
  What to do / Must NOT do: Add `apps/web/src/components/campaign-*` with new `Campaign` nav item, contact-group picker (reuse, multi-select), WAHA group picker, message + follow-up textarea (reuse T1 parser), trigger toggle (any vs per-emoji, default any), schedule datetime, and list with state badges; mount via `view-pages.tsx`/`dashboard-view-router.tsx` with Personal/Business scope. Must NOT fetch WAHA groups without `hasGrant` nor expose secrets.
  Parallelization: Wave 4 | Blocked by: G4, G5 | Blocks: Final
  References: apps/web/src/components/view-pages.tsx:59, apps/web/src/components/recipient-selector.tsx:51, DESIGN.md:69
  Acceptance criteria: Playwright `npx --yes pnpm@10.12.4 exec playwright test tests/campaign.spec.ts --project=chromium` passes: create contact group → create campaign → group message scheduled → reactor mock → follow-up appears in sent-history.
  QA scenarios: Playwright happy: create campaign → scheduled; failure: without grant campaign list empty; Evidence .omo/evidence/task-7-group-reaction-campaign.md
  Commit: Y | feat(web): add campaign menu and reaction trigger UI

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Agent-executed browser/API QA (replaces manual QA)
- [x] F4. Scope fidelity

## Commit strategy
- One commit per todo G1-G7 as listed; F1-F4 are checks, not commits. Keep `feat(waha)`/`feat(api)`/`feat(web)` prefixes.

## Success criteria
- Create contact group, add 2 contacts, reuse in second group — both groups list correctly scoped.
- Create WAHA group via app, campaign scheduled to that `@g.us` is `scheduled` then `sent`.
- React with any emoji to group message as member → 1:1 follow-up `submitted` to reactor; non-member reaction → no send; duplicate reaction idempotent.
- Campaign list is scoped, paginated 20/50, ordered DESC, no cross-scope leakage, no WAHA key exposure.
