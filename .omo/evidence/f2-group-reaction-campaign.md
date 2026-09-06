# F2 Code Quality Review: group-reaction-campaign

## Verdict

**NOT APPROVED.** The scoped Biome check fails on `apps/web/src/campaign-api.ts`,
and the workspace typecheck fails. The implementation also has two type-model
quality issues that should be corrected before approval.

## Scope inspected

- WAHA group client and session group types.
- Contact-group types, schema, and repository.
- Campaign schema, repository, service, HTTP routes, and reaction trigger.
- Web campaign API and `campaign-form`, `campaign-group-picker`,
  `campaign-list`, and `campaign-page` components.
- Campaign-specific CSS additions in `apps/web/src/styles.css`.

## Findings

### F2-1 — Biome formatting failure (high)

`apps/web/src/campaign-api.ts` is not formatted according to the repository's
Biome configuration. Biome requests multiline formatting for the schemas,
`CampaignInput`, and several `requestJson` calls. The scoped command reported
one error and did not apply fixes.

### F2-2 — Workspace typecheck failure (high; partly outside this feature scope)

`npx --yes pnpm@10.12.4 typecheck` exits 1 with TS4111 errors:

- `apps/api/src/app-session-service.ts:114` — `WAHA_WEBHOOK_BASE_URL`
- `apps/api/src/waha/sessions.ts:133` — `notifyName` (twice)
- `apps/api/src/waha/webhook-http.ts:14` — `WAHA_WEBHOOK_SECRET`
- `apps/api/src/waha/webhook-http.ts:16` — `WAHA_WEBHOOK_SECRET_FILE`

These require bracket access for index-signature properties. No campaign
source file was reported by TypeScript, but the required workspace gate is not
green.

### F2-3 — Campaign response state is not modeled as the canonical state union

`apps/web/src/campaign-api.ts` defines `state` as `z.string()`, while the API
and database use `scheduled | sent | failed`. This widens the client model and
allows invalid states through the response boundary. `campaign-list.tsx` also
checks `acknowledged` and `cancelled`, states not present in the campaign
contract, so those branches are dead and indicate model drift. Use a shared
canonical state schema/type and render only supported states.

### F2-4 — Trigger data loses type safety at the API/repository boundary

`campaigns-http.ts` accepts `trigger.type` as any non-empty string,
`campaigns.ts` stores `trigger` as `unknown`, and the repository also accepts
`unknown`. The web input models `any | emoji`, but the server does not enforce
that discriminated union. Define and parse the trigger union at the HTTP
boundary, then carry that typed value through the service and repository.

## Positive checks

- No `innerHTML`, `outerHTML`, or `execCommand` usage was found in the scoped
  API or web source. The preview uses `DOMParser` plus an explicit React node
  allowlist; it does not inject HTML into the DOM.
- Campaign CSS uses the established design tokens (`--space-*`, `--color-*`,
  `--type-*`, `--radius-*`, `--control-height`, and `--focus-ring`). No raw
  component color or spacing literals were found in the campaign components.
- Type-only imports are used consistently in the inspected campaign files.
- Sensitive campaign message fields remain encrypted in the repository and are
  omitted from `safeCampaign` responses.

## Verification evidence

### Scoped Biome

Command:

```text
npx --yes pnpm@10.12.4 exec biome check apps/api/src/waha/groups.ts apps/api/src/waha/groups.test.ts apps/api/src/contact-groups-types.ts apps/api/src/contact-groups.test.ts apps/api/src/db/schema/contact-groups.ts apps/api/src/db/schema/campaigns.ts apps/api/src/db/repositories/contact-groups.ts apps/api/src/db/repositories/campaigns.ts apps/api/src/campaigns.ts apps/api/src/campaigns-http.ts apps/api/src/campaigns/reaction-trigger.ts apps/api/src/campaigns/reaction-trigger.test.ts apps/api/src/campaigns.test.ts apps/api/src/campaigns-http.test.ts apps/api/src/webhook-reaction.test.ts apps/web/src/campaign-api.ts apps/web/src/components/campaign-form.tsx apps/web/src/components/campaign-group-picker.tsx apps/web/src/components/campaign-list.tsx apps/web/src/components/campaign-page.tsx
```

Result: **FAIL** — one formatting error in `apps/web/src/campaign-api.ts`.

### Workspace typecheck

Command:

```text
npx --yes pnpm@10.12.4 typecheck
```

Result: **FAIL** — five TS4111 diagnostics listed in F2-2.

### Full Biome command

Command:

```text
npx --yes pnpm@10.12.4 exec biome check
```

Result: **FAIL**. In addition to the scoped campaign-api formatting error, it
reported pre-existing/unrelated `.tmp` and host-path diagnostics, including
permission-denied paths. No full-repository pass is claimed.

## Required follow-up

Format `campaign-api.ts`, fix the workspace index-signature diagnostics, and
tighten the canonical campaign state and trigger schemas before rerunning F2.
