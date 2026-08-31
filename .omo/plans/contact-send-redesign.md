# contact-send-redesign - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A calmer, consistent Contacts/Direct/Scheduled recipient experience with one single-target selector, live individual-chat selection, manual E.164 fallback, visible consent/session state, and honest disabled group rows.

**Why this approach:** Directory choices will use the existing server contact-resolution seam and verified `contactId` contract, so the redesign fixes the current broken raw-chat-ID path without duplicating authorization or safety logic.

**What it will NOT do:** It will not add a saved-address-book API, group messaging, bulk/broadcast behavior, media, recurring schedules, or new safety semantics.

**Effort:** Medium
**Risk:** Medium - recipient selection and consent presentation sit on the send path, which currently has limited component coverage.
**Decisions to sanity-check:** live WAHA directory rather than persisted roster; auto-resolve directory selections; groups visible-but-disabled; existing consent attestation retained alongside server truth.

Your next move: approve this plan, then start the worker phase; optional high-accuracy review can run before implementation.

---

> TL;DR (machine): Medium-risk web redesign with existing-contract contact resolution, consent-honest single-target selection, focused tests, responsive QA, and local Compose verification.

## Scope
### Must have
- One reusable single-target selector shared by Contacts, Direct, and Scheduled messaging actions.
- Manual E.164 entry and live scoped individual-chat selection, with directory selection auto-resolving to a safe contact ID before submission; only `@c.us` rows derive E.164, while `@lid`/non-derivable rows remain visible but unavailable with manual-entry guidance.
- Explicit selected-session context, server-returned consent/opt-out state, and preserved per-send consent attestation.
- Visible but disabled group rows with accessible explanation; no group target can be selected.
- Token-only styling matching `DESIGN.md`, responsive at 375/768/1280, and explicit loading/error/empty/busy/denied states.
- Focused unit/component/HTTP regression coverage and evidence under `.omo/evidence/`.
- Local Compose rebuild/health verification at `100.124.184.116:8081`, preserving named volumes.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- No persisted contacts-list API, address-book sync, database migration, or unrelated page redesign.
- No multi-select, bulk send, group messaging, broadcast/campaign, media, recurring schedule, templates, or chat-content preview.
- No client-only consent authorization, server gate changes, auth/CSRF/scope weakening, secret exposure, or browser persistence.
- Do not edit protected `.omo/plans/waha-command-center.md` or `.omo/start-work/ledger.jsonl`.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Vitest, existing HTTP integration seams, and Playwright responsive/accessibility QA.
- Evidence: `.omo/evidence/task-contact-send-redesign.md` with exact commands, redacted outputs, screenshots/accessibility snapshots, and Compose health results.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1: design-system contract, characterization/regression tests, and decision-log reconciliation.
- Wave 2: selector/resolution state, API target threading, and directory styling can proceed in parallel after Wave 1.
- Wave 3: integrate Contacts/Send/Schedule surfaces and schedule control behavior.
- Wave 4: focused verification, browser QA, evidence, and Compose deployment.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 4 | 2 only for test inventory |
| 2 | 1 | 3, 4 | 3 |
| 3 | 1 | 5 | 2 |
| 4 | 1 | 5 | 2 |
| 5 | 2, 3, 4 | 6 | none |
| 6 | 5 | 7 | none |
| 7 | 6 | final wave | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Define the selector contract and lock the current behavior with tests
  What to do / Must NOT do: Extend `DESIGN.md` with the recipient-selector structure, single-select variants, consent/session states, disabled-group accessibility, non-derivable `@lid` state, and reduced-motion rules. Add failing characterization tests for current validation, directory group disabling, scope/session reset, and consent-required behavior before changing UI. Record the stale groups-roster wording and its superseding visible-but-disabled decision in `.claude/state/DECISIONS_LOG.md`. Do not add a new design language or weaken server consent.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4
  References (executor has NO interview context - be exhaustive): `DESIGN.md:1-190`; `apps/web/src/components/ui.tsx`; `apps/web/src/components/chat-directory.tsx`; `apps/web/src/components/message-composer.tsx`; `apps/web/src/components/contact-lookup.tsx`; `apps/web/src/dashboard-model.ts:103-117`; `tests/task-14-dashboard-model.test.ts`; `tests/messaging-resolution.test.ts`; `tests/messaging.test.ts`; `CONTEXT.md:39-58,109-120`.
  Acceptance criteria (agent-executable): tests assert manual E.164 plus pre-resolved `contactId` handling, `@g.us` rejection in submission validation, one selectable target, disabled group text, disabled/non-derivable `@lid` guidance, and server `consent_required`; `DESIGN.md` specifies selector states before component implementation; no protected plan/ledger files change.
  QA scenarios (name the exact tool + invocation): happy `npx --yes pnpm@10.12.4 feature --test-file tests/task-14-dashboard-model.test.ts --test-name "validates individual recipient targets" --paths apps/web/src/dashboard-model.ts tests/task-14-dashboard-model.test.ts`; failure same command with group/consent test name; Evidence `.omo/evidence/task-1-contact-send-redesign.md`.
  Commit: N unless explicitly authorized | docs(design): define single-recipient selector contract
- [ ] 2. Implement the reusable single-target selector and resolution state
  What to do / Must NOT do: Add the selector component under `apps/web/src/components/`, supporting manual E.164 input, one live directory choice, explicit selected session, server-resolution loading/error/success, consent/opt-out status, and clear/reset behavior. For an individual `@c.us` row, derive the E.164 number from the chat ID and call existing `onResolve`; retain the returned safe contact ID. Render `@lid` and any non-derivable individual row visibly unavailable with manual-E.164 guidance. Manual input must clear stale IDs. Never submit raw directory IDs or attempt to change the server's deliberate chat-address rejection path.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `apps/web/src/components/chat-directory.tsx`; `apps/web/src/components/contact-lookup.tsx`; `apps/web/src/components/message-composer.tsx`; `apps/web/src/components/ui.tsx`; `apps/web/src/dashboard-controller.ts`; `apps/web/src/dashboard-api.ts`; `apps/web/src/dashboard-model.ts`; `apps/api/src/messaging.ts:74-151`; `apps/api/src/messaging-http.ts:37-40`.
  Acceptance criteria (agent-executable): selecting a derivable individual `@c.us` chat invokes resolution with derived E.164 and stores `contactId`; `@lid`/non-derivable rows cannot be selected and explain manual entry; changing manual input removes the stored ID; unresolved/unavailable directory leaves manual entry usable; resolution failure never falls back to a raw chat-ID submission; only one recipient is represented; Viewer/denied states disable mutation controls; scope changes cannot retain a prior-scope session or target.
  QA scenarios (name the exact tool + invocation): happy Playwright component/E2E `@c.us` selection derives E.164 and resolves successfully; failure `@lid`, `contact_not_found`, or unavailable response shows the manual-E.164 path and never emits the raw ID; evidence in `.omo/evidence/task-2-contact-send-redesign.md`.
  Commit: N unless explicitly authorized | feat(web): add server-resolved recipient selector
- [ ] 3. Thread verified contact IDs through Direct and Scheduled API calls
  What to do / Must NOT do: Extend web send/schedule input types with optional `contactId`; request builders prefer `{ contactId }` after directory resolution and `{ phoneNumber }` for manual input. Preserve idempotency, scope, CSRF, route shapes, and server-side safety gates; do not modify `apps/api/src/messaging.ts` authorization or consent behavior.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `apps/web/src/dashboard-api.ts:108-120,257-295`; `apps/web/src/dashboard-controller.ts`; `apps/api/src/messaging-http.ts:37-40,110`; `apps/api/src/messaging.ts:114-223`; `tests/messaging-http.test.ts`; `tests/messaging.test.ts`; `tests/messaging-resolution.test.ts`.
  Acceptance criteria (agent-executable): HTTP tests prove verified `{ contactId }` and manual `{ phoneNumber }` variants are serialized correctly; no raw directory chat ID is serialized; contact-ID sends and schedules still pass through existing authorization/consent paths; manual phone requests remain unchanged; no API gate or schema regression is introduced.
  QA scenarios (name the exact tool + invocation): happy `npx --yes pnpm@10.12.4 feature --test-file tests/messaging-http.test.ts --test-name "accepts contact ID message targets" --paths apps/web/src/dashboard-api.ts tests/messaging-http.test.ts`; failure cross-scope/contact-without-consent test shows denial; Evidence `.omo/evidence/task-3-contact-send-redesign.md`.
  Commit: N unless explicitly authorized | feat(web): submit verified contact targets
- [ ] 4. Style the live directory and normalize recipient/session copy
  What to do / Must NOT do: Add token-based styles for `.chat-directory`, `.chat-directory-list`, `.directory-item`, selected/resolved/disabled/loading/empty/error states, and responsive layout. Remove `@g.us` placeholder/helper language, make the active session explicit, and preserve group-visible-but-disabled wording. Use existing primitives and tokens only; no decorative gradients, glass, raw hex, or new CSS framework.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `apps/web/src/styles.css`; `DESIGN.md:13-42,67-94,131-141,155-190`; `apps/web/src/components/chat-directory.tsx`; `apps/web/src/components/message-composer.tsx`; `apps/web/src/components/contact-lookup.tsx`; `apps/web/src/components/dashboard-view-router.tsx`.
  Acceptance criteria (agent-executable): all new styles use existing custom properties; compact/tablet/wide layouts have no horizontal overflow; group rows are visibly unavailable and not selectable; focus-visible, disabled, busy, dark-mode, and reduced-motion rules exist; no `@g.us` recipient guidance remains.
  QA scenarios (name the exact tool + invocation): happy Playwright screenshots/accessibility snapshots at 375/768/1280; failure directory API unavailable and long names render without overflow; Evidence `.omo/evidence/task-4-contact-send-redesign.md`.
  Commit: N unless explicitly authorized | style(web): establish contact directory states
- [ ] 5. Integrate the selector across Contacts, Direct, and Scheduled actions
  What to do / Must NOT do: Replace duplicated recipient controls with the reusable selector in `ContactLookup` and `MessageComposer` for both modes. Preserve the existing AI review checkpoint, one-time scheduling, explicit consent attestation, `ActionFeedback`, `ResourceStateBody`, role checks, and dispatch-time server gates. Apply the same scope/session reset behavior to Contacts that Send/Schedule already use.
  Parallelization: Wave 3 | Blocked by: 2, 3, 4 | Blocks: 6
  References (executor has NO interview context - be exhaustive): `apps/web/src/components/view-pages.tsx`; `apps/web/src/components/contact-lookup.tsx`; `apps/web/src/components/message-composer.tsx`; `apps/web/src/components/schedule-jobs-panel.tsx`; `apps/web/src/components/ai-review-panel.tsx`; `apps/web/src/components/action-feedback.tsx`; `apps/web/src/dashboard-model.ts`; `CONTEXT.md:55-82,109-120`.
  Acceptance criteria (agent-executable): Contacts, Send, and Schedule each expose exactly one recipient selector; directory selection resolves before send/schedule; consent status is server-derived and session-scoped; Viewer cannot mutate; manual fallback works when directory is unavailable; scheduled jobs retain one-time text semantics and dispatch-time safety.
  QA scenarios (name the exact tool + invocation): happy Playwright Direct and Scheduled flows with manual and directory targets; failure unrecorded consent shows `consent_required`, scope switch clears prior target, and empty schedule datetime remains client-invalid; Evidence `.omo/evidence/task-5-contact-send-redesign.md`.
  Commit: N unless explicitly authorized | refactor(web): unify recipient interactions
- [x] 6. Run focused verification and responsive browser QA
  What to do / Must NOT do: Run diagnostics, focused tests, typecheck, scoped Biome, and the existing Playwright visual/accessibility flow. Record exact commands/results and clean disposable artifacts. Do not claim full release verification or visual success without executed evidence.
  Parallelization: Wave 4 | Blocked by: 5 | Blocks: 7
  References (executor has NO interview context - be exhaustive): all changed files; `README.md:155-169`; `AGENTS.md` testing/evidence contract; `tests/e2e/`; `.omo/evidence/` conventions; `DESIGN.md`.
  Acceptance criteria (agent-executable): `lsp_diagnostics` reports zero errors for changed TypeScript/CSS-adjacent files; focused feature commands, typecheck, and scoped Biome exit 0; Playwright assertions cover happy/failure paths at 375/768/1280; evidence contains redacted outputs and no secrets.
  QA scenarios (name the exact tool + invocation): happy focused Vitest plus `npx --yes pnpm@10.12.4 typecheck` and scoped Biome; failure-path Playwright assertions for unavailable directory, denied consent, Viewer, and disabled groups; Evidence `.omo/evidence/task-6-contact-send-redesign.md`.
  Commit: N unless explicitly authorized | test(web): verify recipient redesign behavior
- [x] 7. Rebuild and verify the requested local Compose deployment
  What to do / Must NOT do: Rebuild only the local development stack with the existing secrets/env, preserve named volumes, verify API/web/Postgres/WAHA health, and exercise the redesigned UI at `http://100.124.184.116:8081`. Do not change Compose bindings, expose WAHA, print secrets, or run destructive volume cleanup.
  Parallelization: Wave 4 | Blocked by: 6 | Blocks: final verification wave
  References (executor has NO interview context - be exhaustive): `README.md:53-60,128-153`; `docs/operations.md`; `docker-compose.yml`; `docker-compose.override.yml`; `docker-compose.bundled-waha.yml`; existing `.env`/secret-file conventions; `100.124.184.116:8081` runtime target.
  Acceptance criteria (agent-executable): `docker compose -p relaynest-dev ps` shows required services healthy; Tailscale URL loads the new UI; Direct/Scheduled selector happy/failure checks pass against the running stack; named data volumes remain present; logs/evidence are redacted.
  QA scenarios (name the exact tool + invocation): happy rebuild via the repository's dev-bundled command and Playwright against `http://100.124.184.116:8081`; failure verify unavailable directory still permits manual entry and stop only disposable services with the documented command; Evidence `.omo/evidence/task-7-contact-send-redesign.md`.
  Commit: N | runtime verification only

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit — direct source/diff review and focused verification evidence complete.
- [x] F2. Code quality review — typecheck, scoped Biome, build, and diff-check complete; no type suppressions introduced.
- [x] F3. Real manual QA — Playwright visual capture and live Tailscale HTTP/Compose health checks passed.
- [x] F4. Scope fidelity — groups remain disabled, target remains single-recipient, and protected server safety paths were not changed.

## Commit strategy
- Do not commit by default; the user has not explicitly authorized commits. If authorization is later given, use one semantic commit per implementation todo in dependency order, inspect `git status`, `git diff`, and the staged diff first, preserve unrelated user changes, and never include protected plan/ledger rewrites, runtime artifacts, or secrets.

## Success criteria
- Contacts, Direct, and Scheduled surfaces each present one clear single-recipient selector.
- Derivable `@c.us` directory selection resolves to a verified contact ID; `@lid`/non-derivable rows remain unavailable and manual E.164 remains a working fallback.
- Groups remain visible but disabled, and no group/bulk/broadcast path exists.
- Consent, scope, role, CSRF, idempotency, and dispatch-time safety semantics remain server-authoritative.
- Design-system, accessibility, responsive, focused-test, typecheck, lint, and Compose health evidence is recorded with exact commands and redacted output.
