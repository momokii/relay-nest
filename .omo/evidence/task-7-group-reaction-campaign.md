# G7 — Group reaction campaign UI

## Implementation

- Added the scoped Campaign navigation destination and page definition.
- Added `campaign-api.ts` with Zod response parsing and scoped campaign, contact-group, and WAHA-group requests.
- Added campaign form, multi-select contact-group picker, grant-backed session/WAHA-group picker, message/follow-up fields, safe WhatsApp parser preview, trigger toggle (Any emoji default / Per emoji), datetime/timezone, and state-badge campaign history.
- Campaign history is cleared on unavailable/denied responses. WAHA groups are not requested until an explicit authorized session is selected. No WAHA credential is rendered or stored in browser code.

## Verification

- `npx --yes pnpm@10.12.4 --filter @waha-command-center/web exec tsc --noEmit --pretty false` — passed.
- `npx --yes pnpm@10.12.4 exec biome check apps/web/src/components/campaign*` — passed.
- Root `npx --yes pnpm@10.12.4 typecheck` — blocked by pre-existing API errors in `app-session-service.ts`, `waha/sessions.ts`, and `waha/webhook-http.ts`; no web diagnostics were reported.
- Requested Playwright command could not run because the repository Playwright configuration has no `chromium` project and `tests/campaign.spec.ts` is absent.
- Headed screenshot QA was not run because the requested campaign E2E fixture/configuration is absent; no screenshot artifact is claimed.

## Adversarial coverage

- Scope is included on every campaign request and campaign list only renders the active-scope response.
- Denied or unavailable campaign responses render an empty authorized-scope state.
- Message preview uses the existing WhatsApp parser and renders only an allow-listed set of parsed elements; raw HTML is never injected.
- Stale async group responses are ignored after scope/session changes.
