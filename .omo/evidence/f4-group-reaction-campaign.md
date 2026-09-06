# F4 scope fidelity — group-reaction-campaign

**Date:** 2026-09-04
**Verdict:** **FAIL — two scope controls require remediation before approval.**

## Scope requirements checked

Source of requirements: `.omo/plans/group-reaction-campaign.md`, Scope and
Final verification sections (lines 21–37 and 116–130).

| Check | Result | Evidence |
| --- | --- | --- |
| Personal/Business isolation | PASS for covered paths | `createCampaignService.schedule` requires the session, contact-group grant, and session lookup using the same `accountScope` (`apps/api/src/campaigns.ts:104-126`). Contact-group queries include scope predicates (`apps/api/src/db/repositories/contact-groups.ts:16-29, 111-117, 160-171`). Campaign HTTP routes validate and pass scope, and safe projections omit protected message fields (`apps/api/src/campaigns-http.ts:26-67, 97-117`). Reaction campaign selection is constrained by scope and session (`apps/api/src/db/repositories/campaigns.ts:96-112`). | `apps/api/src/campaigns-http.test.ts`: 4 passed, including Personal/Business response separation and Viewer denial. `apps/api/src/campaigns.test.ts`: 3 passed, including out-of-scope session denial. `apps/api/src/webhook-reaction.test.ts`: forged scope path rejected. |
| `hasGrant` before protected decryption | **FAIL** | Contact-group member reads do enforce `requireGrant` before `decode` (`apps/api/src/db/repositories/contact-groups.ts:160-171`), and campaign scheduling checks session/contact-group grants before creating encrypted data (`apps/api/src/campaigns.ts:104-127`). However, campaign repository `safe()` decrypts `followUpMessage` (`apps/api/src/db/repositories/campaigns.ts:26-50`) and is called by `find` and `listForReaction` without any `hasGrant` check. `listForReaction` is invoked by the webhook-trigger path, which has scope/session filtering but no user grant (`apps/api/src/campaigns/reaction-trigger.ts:69-74`). This does not satisfy the stated grant-before-decryption control for campaign follow-up plaintext. |
| WAHA credential exposure | PASS | Campaign/group browser code contains no `X-Api-Key` or `WAHA_API_KEY` transport. The adapter owns the header server-side (`apps/api/src/waha/adapter.ts:165,221`); the campaign UI receives only parsed group/campaign projections (`apps/web/src/campaign-api.ts`, `apps/web/src/components/campaign-*`). `safeCampaign` excludes message ciphertext and provider credentials (`apps/api/src/campaigns-http.ts:55-68`). Repository-wide scan found credential references only in server/config/docs/tests, not campaign browser code. |
| Bounded reads | **FAIL** | HTTP campaign listing caps `pageSize` at 50 (`apps/api/src/campaigns-http.ts:26-32,103-117`), and single campaign lookup uses `limit(1)` (`apps/api/src/db/repositories/campaigns.ts:88-94`). But reaction dispatch reads every matching sent campaign with no SQL `limit` or page bound (`apps/api/src/db/repositories/campaigns.ts:96-112`); contact-group `listMembers` also has no row cap (`apps/api/src/db/repositories/contact-groups.ts:160-171`). These are unbounded reads in the new feature path. |
| Text-only; no media/broadcast expansion | PASS | Campaign transport calls only `sendText` and normalizes the destination to `@g.us` (`apps/api/src/campaigns.ts:163-195`). Reaction follow-up calls the existing 1:1 `sendImmediate`; no media or broadcast API was added. Campaign implementation files contain no `sendMedia`, media download, or broadcast path. |
| No inbox sync beyond reaction | PASS | The feature adds only `message.reaction` subscription/normalization and callback dispatch (`apps/api/src/waha/sessions.ts:245`, `apps/api/src/waha/webhook.ts:17,334`). No campaign code calls chats/messages or creates inbox synchronization. Existing chat/message routes in `session-http.ts` are outside this feature diff. |
| No autonomous follow-up without a trigger | PASS | Follow-up dispatch is reachable from the reaction callback and requires a matching sent campaign, contact-group membership, and a dedupe key (`apps/api/src/campaigns/reaction-trigger.ts:69-117`). The scheduled group message is an explicit user-created one-time schedule, not an untriggered follow-up. Safety gates remain in the existing messaging service. |

## Regression evidence

Focused command:

```text
npx --yes pnpm@10.12.4 exec vitest run \
  apps/api/src/waha/groups.test.ts \
  apps/api/src/campaigns.test.ts \
  apps/api/src/campaigns-http.test.ts \
  apps/api/src/webhook-reaction.test.ts \
  apps/api/src/campaigns/reaction-trigger.test.ts
```

Result: **5 test files passed, 17 tests passed.** These tests cover scoped HTTP
responses, oversized HTTP page-size capping, session denial, forged webhook
scope rejection, encrypted reaction persistence, non-member suppression, and
reaction deduplication. The contact-group integration suite is skip-gated when
`DATABASE_URL` is absent/unusable; its existing assertions are recorded in
`.omo/evidence/task-2-group-reaction-campaign.md`.

Scoped Biome was attempted on the feature source. It reported the pre-existing
unused suppression in `apps/api/src/waha/sessions.ts:132` and formatting needed
in `apps/web/src/campaign-api.ts`; no source was changed during this F4 audit.
LSP diagnostics are not available in this environment because no diagnostics
connection/tool is configured. Workspace typecheck remains blocked by the
pre-existing `TS4111` diagnostics recorded in the task evidence.

## Required follow-up before F4 can pass

1. Make campaign plaintext projection/decryption require an explicit, validated
   grant (or introduce a narrowly scoped internal authorization contract for
   the webhook worker) before `followUpMessage` is decrypted.
2. Bound `listForReaction` and `listMembers` (or prove a fixed cardinality with
   an enforced database/application limit), then add regression coverage for
   the bound.

No implementation changes were made by this verification task.
