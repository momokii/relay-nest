# relaynest-next-phases - Work Plan

## TL;DR (For humans)
**What you'll get:** A fully exercised authenticated dashboard, hardened deployment/runbook coverage, and reproducible release-readiness evidence for the remaining RelayNest roadmap.

**Why this approach:** Close the already-composed backend contracts through vertical browser-backed slices first, then harden Compose and finally run release gates. Each verified tranche is isolated, reviewable, committed, and pushed before the next begins.

**What it will NOT do:** It will not add media, campaigns, broadcasts, recurring schedules, public registration, autonomous AI sending, scraping, spam, stealth, or public WAHA exposure. It will not claim bundled-WAHA success while the pinned image remains unavailable.

**Effort:** XL
**Risk:** High - Todo 14 spans authenticated browser flows, Compose depends on an unavailable image manifest, and final gates currently lack local checker commands.
**Decisions to sanity-check:** Sequential phase gating; disposable PostgreSQL plus deterministic WAHA seams; no guessed bundled image tag; commit/push after each verified tranche.

Your next move: approve starting execution now, or request the optional high-accuracy plan review. Full execution detail follows below.

---

> TL;DR (machine): XL sequential rollout: close Todo 14 browser acceptance, harden Todo 15 Compose/operations, establish and run Todo 16/F1-F4; high risk from environment blockers and missing verification scripts.

## Scope
### Must have
- Complete the authenticated dashboard acceptance required by the original Todo 14: sessions/linking/status, immediate text send, schedule list/detail/edit/cancel, restart/recovery visibility, notification settings/history/test, retention preview/confirmation, Admin/user/grant/scope denial, keyboard/a11y smoke, and human-approved AI behavior.
- Keep all server-side scope/grant/CSRF/same-origin/secret-redaction protections intact and prove them at API and real browser seams.
- Complete Todo 15’s dashboard-only external-WAHA and bundled-WAHA Compose validation where the exact image reference is available; otherwise preserve a redacted blocker and do not mark bundled runtime complete.
- Add reproducible local verification commands required by Todo 16/F1-F4: requirements mapping, secret scan, scope scan, and documentation/link checks, without claiming unavailable tools passed.
- Produce redacted evidence per tranche, update live state, commit atomically, and push after verification.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- No media, full inbox parity, recurring schedules, campaigns, broadcasts, public registration, scraping, spam, stealth, anti-detection, or ban evasion.
- No autonomous AI sending; AI approval must remain human-confirmed and return `sendState: "not_sent"`.
- No browser-visible WAHA credentials, public WAHA master-port exposure, auth bypass, scope weakening, or client-only authorization.
- No real WhatsApp account/credential use, no fabricated provider delivery claim, and no guessed or untested bundled-WAHA image tag.
- No marking a Todo or final gate complete while its required command, evidence, or environment prerequisite is unavailable.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD vertical slices with Vitest, disposable PostgreSQL integration, Playwright Chromium E2E, Compose validation, Biome, typecheck, build, audit, and repository-local verification scripts.
- Evidence: `.omo/evidence/task-<N>-next-phases-*.md` per tranche plus `.omo/evidence/final-*.md` for F1-F4. Every happy and failure scenario records exact command, result, and cleanup.

## Execution strategy
### Parallel execution waves
> Execute one wave at a time. Within a wave, independent slices may run in parallel only after the shared fixtures and contracts are stable; each slice is committed/pushed before the next dependent wave.

- Wave 1: Todo 14 dashboard acceptance slices (1-5).
- Wave 2: Todo 15 Compose/runtime and operations slices (6-8).
- Wave 3: Todo 16 verification tooling and release matrix (9-11).
- Final wave: F1-F4 independent audits after all implementation todos.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1-5 | Original plan Todos 5, 7, 9, 10, 11, 13 | 6-11 | 1-4 after shared fixture review |
| 6-8 | Original plan Todos 1, 3, 6, 7; Todo 14 where shared Compose fixtures are needed | 9-11 | 6-7 after topology review |
| 9 | Todos 14-15 implementation outcomes | 10-11 | None |
| 10 | Todo 9 verification tooling | 11 | 10-11 after tool contracts are fixed |
| 11 | Todos 14-16 | F1-F4 | None |
| F1-F4 | Todo 11 | Release declaration | F1-F4 in parallel |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Close authenticated session linking, lifecycle, status, and recovery acceptance
  What to do / Must NOT do: Use the existing authenticated session API, adapter, controller, and service seams to expose the missing dashboard-backed linking/create flow and complete status/lifecycle/recovery presentation. Preserve explicit scope selection, grant checks, destructive confirmations, unavailable-provider states, and redaction. Do not rewrite green session backend contracts or expose QR/pairing credentials beyond their existing safe response shapes.
  Parallelization: Wave 1 | Blocked by: Original Todos 5 and 7 | Blocks: 5 | Can parallelize with: 2-4 after shared fixture review
  References (executor has NO interview context - be exhaustive): `apps/api/src/auth/http.ts`; `apps/api/src/waha/session-http.ts`; `apps/api/src/waha/session-types.ts`; `apps/web/src/dashboard-session-api.ts`; `apps/web/src/session-controller.ts`; `apps/web/src/components/session-page.tsx`; `tests/task-14-auth-session.integration.test.ts`; `tests/e2e/task-14-admin-access.spec.ts`; `tests/e2e/dashboard.spec.ts`; `.omo/evidence/task-14-auth-session.md`; `.omo/evidence/task-14-gap-matrix.md`; original plan Todo 14 at `.omo/plans/waha-command-center.md:217-223`.
  Acceptance criteria (agent-executable): Red test first at the real dashboard/API seam; then `npx --yes pnpm@10.12.4 exec vitest run tests/task-14-auth-session.integration.test.ts` and `npx --yes pnpm@10.12.4 exec playwright test tests/e2e/task-14-admin-access.spec.ts tests/e2e/dashboard.spec.ts --grep "session|lifecycle|grant|scope"` pass against disposable PostgreSQL and deterministic WAHA. Browser assertions prove create/link/status/lifecycle/recovery or explicit unavailable state, scope denial, confirmation gates, and no secret/opaque credential leakage.
  QA scenarios (name the exact tool + invocation): happy: authenticated Admin creates/grants a scoped session and exercises status/lifecycle controls; failure: Business-only Operator attempts Personal linking/lifecycle and a destructive action without confirmation, expecting safe denial/no mutation. Evidence `.omo/evidence/task-14-next-phases-session.md`.
  Commit: Y | `feat(web): complete authenticated session acceptance`

- [x] 2. Close authenticated schedule list, detail, edit, cancel, and recovery acceptance
  What to do / Must NOT do: Exercise the existing schedule API through the real authenticated dashboard with persisted jobs, recovery state, scope/grant checks, CSRF/same-origin mutation gates, terminal locks, and stale-response protection. Keep recipient/message/idempotency/lease/provider-secret fields server-side and redacted.
  Parallelization: Wave 1 | Blocked by: Original Todos 9, 10, and 13 | Blocks: 5 | Can parallelize with: 1, 3, 4
  References (executor has NO interview context - be exhaustive): `apps/api/src/scheduled-http.ts`; `apps/api/src/scheduler/types.ts`; `apps/web/src/dashboard-schedule-api.ts`; `apps/web/src/schedule-controller.ts`; schedule components under `apps/web/src/components/`; `tests/task-14-schedule-contracts.integration.test.ts`; `tests/task-14-schedule-adversarial.integration.test.ts`; `tests/e2e/schedule-race.spec.ts`; `.omo/evidence/task-14-scheduling.md`; `.omo/evidence/task-14-gap-matrix.md`.
  Acceptance criteria (agent-executable): Red browser coverage is added at the real app route, then `npx --yes pnpm@10.12.4 exec vitest run tests/task-14-schedule-contracts.integration.test.ts tests/task-14-schedule-adversarial.integration.test.ts` and `npx --yes pnpm@10.12.4 exec playwright test tests/e2e/schedule-race.spec.ts tests/e2e/dashboard.spec.ts --grep "schedule|scope|cancel|edit"` pass. Persisted `unknown`/`lease_expired` recovery is visible; cross-scope, malformed, missing-CSRF, terminal-lock, and stale-response cases remain safe.
  QA scenarios (name the exact tool + invocation): happy: edit and cancel a future scoped job, then reload and observe persisted state; failure: mutate a foreign/terminal job or omit CSRF and assert the expected denial/lock without data leakage. Evidence `.omo/evidence/task-14-next-phases-scheduling.md`.
  Commit: Y | `feat(web): complete authenticated scheduling acceptance`

- [x] 3. Close notification and retention browser acceptance
  What to do / Must NOT do: Connect existing notification settings/preferences/test/history and retention list/preview/cancel/confirm adapters to authenticated dashboard flows, preserving Admin-only access, encrypted/masked secrets, disabled-channel no-call behavior, preview binding, scope checks, and content-free audit. Do not display provider passwords, bot tokens, message content, or raw failure payloads.
  Parallelization: Wave 1 | Blocked by: Original Todos 11 and 12 | Blocks: 5 | Can parallelize with: 1, 2, 4
  References (executor has NO interview context - be exhaustive): `apps/api/src/notifications/http.ts`; `apps/api/src/retention/http.ts`; `apps/web/src/dashboard-notification-api.ts`; `apps/web/src/dashboard-retention-api.ts`; notification/retention components under `apps/web/src/components/`; `tests/task-11-notifications-http.integration.test.ts`; `tests/task-14-retention-http.integration.test.ts`; `.omo/evidence/task-14-notification-ai.md`; `.omo/evidence/task-12-waha-command-center.md`.
  Acceptance criteria (agent-executable): Add red browser tests at the authenticated dashboard seam, then run `npx --yes pnpm@10.12.4 exec vitest run tests/task-11-notifications-http.integration.test.ts tests/task-14-retention-http.integration.test.ts` and `npx --yes pnpm@10.12.4 exec playwright test tests/e2e/dashboard.spec.ts --grep "notification|retention|purge"`. Admin happy paths persist masked settings/history and confirmed scoped purge; non-Admin/cross-scope/cancelled-purge paths make zero unauthorized mutation and reveal no secrets.
  QA scenarios (name the exact tool + invocation): happy: configure a channel, observe masked settings, run a disabled/test-send path, preview and confirm one scoped purge; failure: Viewer/Operator reads secrets or confirms a stale/mismatched preview and receives safe denial with zero deletion. Evidence `.omo/evidence/task-14-next-phases-notifications-retention.md`.
  Commit: Y | `feat(web): complete notification and retention acceptance`

- [x] 4. Wire the human-approved AI approval UI seam
  What to do / Must NOT do: Connect the existing typed scoped AI adapter to a dashboard panel that presents a provider-agnostic suggestion/approval interaction only when a suggestion is available, while keeping configured/unavailable states explicit and `sendState: "not_sent"`. Add no generation provider, dispatch call, autonomous worker, or message-send dependency.
  Parallelization: Wave 1 | Blocked by: Original Todo 14 contract and current AI HTTP seam | Blocks: 5 | Can parallelize with: 1-3
  References (executor has NO interview context - be exhaustive): `apps/api/src/ai/http.ts`; `apps/api/src/ai/service.ts`; `apps/web/src/dashboard-ai-api.ts`; `apps/web/src/components/ai-review-panel.tsx`; `tests/task-14-ai-approval-http.test.ts`; `tests/task-14-ai-approval-contract.integration.test.ts`; `.omo/evidence/task-14-notification-ai.md`; `.omo/evidence/task-14-waha-command-center.md`.
  Acceptance criteria (agent-executable): Red UI/HTTP coverage is added first, then `npx --yes pnpm@10.12.4 exec vitest run tests/task-14-ai-approval-http.test.ts tests/task-14-ai-approval-contract.integration.test.ts` and `npx --yes pnpm@10.12.4 exec playwright test tests/e2e/dashboard.spec.ts --grep "AI|approval|not sent|unavailable"` pass. Admin/Operator approval returns explicit approved/not-sent state; Viewer/denied-scope/invalid-CSRF paths are rejected; a dispatch spy remains at zero calls.
  QA scenarios (name the exact tool + invocation): happy: approve an opaque suggestion and observe an accessible `not sent` result; failure: unavailable provider, Viewer, denied scope, malformed input, or missing CSRF produces a safe state and no dispatch. Evidence `.omo/evidence/task-14-next-phases-ai.md`.
  Commit: Y | `feat(web): wire human-approved AI review`

- [x] 5. Close Todo 14 with an integrated authenticated acceptance matrix
  What to do / Must NOT do: Reconcile the four vertical slices into one disposable PostgreSQL plus deterministic-WAHA browser matrix covering Admin bootstrap/user/grant/disable, scope navigation, session linking/status/lifecycle, immediate text send, schedules/recovery, notifications, retention, AI approval, logout, keyboard/a11y, and responsive states. Update the protected plan/ledger and live state only with verified Todo 14 facts. Do not mark provider linking or delivery as real-WAHA success.
  Parallelization: Wave 1 | Blocked by: Todos 1-4 | Blocks: 6-11 | Can parallelize with: None
  References (executor has NO interview context - be exhaustive): `tests/e2e/dashboard.spec.ts`; `tests/e2e/task-14-admin-access.spec.ts`; `tests/e2e/schedule-race.spec.ts`; all `tests/task-14-*.integration.test.ts`; `.omo/evidence/task-14-*.md`; `.claude/state/CURRENT_STATUS.md`; `.claude/state/TASK_QUEUE.md`; `.omo/plans/waha-command-center.md:217-223`.
  Acceptance criteria (agent-executable): Run isolated DB-gated Todo 14 tests, `npx --yes pnpm@10.12.4 exec playwright test tests/e2e --grep "dashboard|schedule|session|admin|notification|retention|approval"`, changed-file Biome, typecheck, web build, and `git diff --check`; all required happy/failure cases pass or are explicitly classified as an environment blocker with evidence. Only then update Todo 14 state and commit/push.
  QA scenarios (name the exact tool + invocation): happy: complete the full authenticated matrix from bootstrap through logout in a disposable environment; failure: run the cross-scope, provider-unavailable, stale-preview, missing-CSRF, and no-dispatch cases and confirm no sensitive output. Evidence `.omo/evidence/task-14-next-phases-dashboard.md`.
  Commit: Y | `test(e2e): close Todo 14 acceptance matrix`

- [ ] 6. Harden Compose runtime boundaries, health, secrets, migrations, and pins
  What to do / Must NOT do: Complete base/external/bundled Compose validation, dependency health gates, migration-before-listen, non-root runtime, internal-only WAHA networking, secret injection, and tested immutable image references. Preserve the API private behind the web proxy and keep secret values absent from resolved config/logs. Do not guess a replacement WAHA image tag.
  Parallelization: Wave 2 | Blocked by: Original Todos 1, 3, 6, and 7 | Blocks: 8-11 | Can parallelize with: 7 after shared Compose topology review
  References (executor has NO interview context - be exhaustive): `docker-compose.yml`; `docker-compose.override.yml`; `docker-compose.external-waha.yml`; `docker-compose.bundled-waha.yml`; `Dockerfile.api`; `Dockerfile.web`; `tests/compose-startup.test.ts`; `tests/compose-external-proxy.test.ts`; `.omo/evidence/compose-external-qa-2026-08-18.md`; `.omo/evidence/compose-qa-2026-08-18.md`.
  Acceptance criteria (agent-executable): `docker compose config --quiet`, external and bundled profile config commands, Compose startup tests, and secret-redaction assertions pass. Disposable external mode reaches healthy Postgres/API/web with API health 200 and no host API/WAHA publish. Bundled mode is marked blocked—not passed—if the exact image manifest remains unavailable.
  QA scenarios (name the exact tool + invocation): happy: start the isolated external stack with placeholder WAHA and verify health/proxy; failure: omit a required secret or use unavailable external WAHA and assert actionable redacted failure without affecting existing projects. Evidence `.omo/evidence/task-15-next-phases-compose.md`.
  Commit: Y | `fix(compose): harden deployment boundaries`

- [ ] 7. Finish operations, security, and deployment documentation
  What to do / Must NOT do: Reconcile `README.md`, `docs/operations.md`, `docs/threat-model.md`, `docs/waha-capability-matrix.md`, and relevant `.claude/` state with actual startup, health, persistence, backup/restore, key rotation, LAN/VPN firewalling, reverse-proxy TLS, cleanup, secret handling, and unofficial-client ban risk. Do not document unavailable checks as passed or promise account safety/delivery certainty.
  Parallelization: Wave 2 | Blocked by: Todo 6 | Blocks: 9-11 | Can parallelize with: 6 after topology facts are stable
  References (executor has NO interview context - be exhaustive): `README.md`; `docs/operations.md`; `docs/threat-model.md`; `docs/waha-capability-matrix.md`; `.claude/README.md`; `.claude/ENVIRONMENT_GUIDE.md`; `.claude/SECURITY_STANDARDS.md`; `.claude/state/CURRENT_STATUS.md`; `.claude/state/TASK_QUEUE.md`; `.claude/state/DECISIONS_LOG.md`.
  Acceptance criteria (agent-executable): Documentation checks inspect every supported Compose mode, required environment/secret, health/cleanup command, public-exposure warning, and ban-risk limitation; all referenced commands are present or explicitly marked unavailable. No docs claim bundled success while the image manifest is unavailable.
  QA scenarios (name the exact tool + invocation): happy: follow the documented external-mode setup in a disposable project and reach health checks; failure: run the documented missing-secret/unavailable-WAHA path and verify the stated redacted failure. Evidence `.omo/evidence/task-15-next-phases-operations.md`.
  Commit: Y | `docs(operations): reconcile deployment runbooks`

- [ ] 8. Resolve or evidence the bundled-WAHA image prerequisite
  What to do / Must NOT do: Verify the pinned bundled image manifest and, only if a published tested immutable reference is available, update the pin with a decision/evidence record and run isolated bundled startup/health QA. If unavailable, preserve the exact registry failure, cleanup proof, and a blocked acceptance status for human/environment follow-up. Never guess a tag, use `latest`, or claim bundled runtime success.
  Parallelization: Wave 2 | Blocked by: external registry availability | Blocks: 9-11 | Can parallelize with: 7
  References (executor has NO interview context - be exhaustive): `docker-compose.bundled-waha.yml`; `.omo/evidence/compose-qa-2026-08-18.md`; `docs/waha-capability-matrix.md`; `.claude/state/CURRENT_STATUS.md`; `.claude/state/TASK_QUEUE.md`.
  Acceptance criteria (agent-executable): Verify the exact image reference with Docker registry/pull commands; successful path must run `docker compose ... --profile waha up --build -d`, health checks, and cleanup; blocked path records non-zero manifest output, zero created resources, and no false pass. Todo 15 remains open on the blocked path.
  QA scenarios (name the exact tool + invocation): happy: bundled stack starts and all services health-check; failure: manifest unavailable and the isolated project leaves no containers/volumes/networks. Evidence `.omo/evidence/task-15-next-phases-bundled.md`.
  Commit: Y | `test(compose): record bundled runtime verification`

- [ ] 9. Add repository-local release verification commands
  What to do / Must NOT do: Add typed, deterministic scripts/package commands for `verify:requirements`, `secret-scan`, `verify:scope`, and `docs:check`, plus focused tests for happy and intentional-failure cases. Parse files at boundaries, report redacted actionable failures, and avoid external network dependence except explicitly invoked registry/docs checks. Do not create a checker that merely returns success.
  Parallelization: Wave 3 | Blocked by: Todos 6-8 and current documentation truth | Blocks: 10-11 | Can parallelize with: None
  References (executor has NO interview context - be exhaustive): `package.json`; `.omo/plans/waha-command-center.md`; `README.md`; `docs/`; `.claude/`; `tests/`; existing scripts/configuration discovered before implementation.
  Acceptance criteria (agent-executable): Each command exits 0 for the current valid fixture and non-zero for a temporary missing-row/forbidden-scope/secret-like/docs-link mutation; tests assert failure reasons and cleanup restores the tree. The commands are documented in package scripts and use no `any`/type suppressions.
  QA scenarios (name the exact tool + invocation): happy: run `npx --yes pnpm@10.12.4 verify:requirements --plan .omo/plans/waha-command-center.md`, `secret-scan`, `verify:scope`, and `docs:check`; failure: run each against an isolated temporary mutation and assert non-zero output. Evidence `.omo/evidence/task-16-next-phases-tooling.md`.
  Commit: Y | `feat(verification): add release gate commands`

- [ ] 10. Run the isolated Todo 16 release-readiness matrix
  What to do / Must NOT do: Execute full typecheck, lint, unit/integration tests with isolated PostgreSQL credentials, Playwright E2E, build, dependency audit, all Compose config modes, secret/scope/docs checkers, authorization matrix, scheduler failure matrix, backup/restore, and evidence cleanup. Fix only defects within the approved scope; preserve unrelated environment blockers as red evidence.
  Parallelization: Wave 3 | Blocked by: Todos 5-9 | Blocks: 11 | Can parallelize with: None
  References (executor has NO interview context - be exhaustive): `.omo/plans/waha-command-center.md:233-239`; `package.json`; `.env.example`; all relevant `tests/`; `docker-compose*.yml`; `docs/operations.md`; `.claude/state/`.
  Acceptance criteria (agent-executable): The exact command chain is run with redacted logs and disposable-resource cleanup. All available gates pass; unavailable bundled WAHA/external scanners and local environment failures are explicitly classified, never counted as passes. Produce `.omo/evidence/task-16-next-phases-release.md` and update state with exact counts.
  QA scenarios (name the exact tool + invocation): happy: isolated PostgreSQL full matrix, Playwright grep matrix, all checkers and Compose configs pass; failure: invalid WAHA key and cross-scope/duplicate/retry/purge/restore cases fail safe without secret/message leakage. Evidence `.omo/evidence/task-16-next-phases-release.md`.
  Commit: Y | `test(release): record Todo 16 verification matrix`

- [ ] 11. Complete F1-F4 final audits and synchronized handoff
  What to do / Must NOT do: Run plan compliance, code quality/security, real executable QA, and scope/documentation audits in parallel after Todos 1-10. Save `.omo/evidence/final-plan-compliance.md`, `final-security-quality.md`, `final-e2e.md`, and `final-scope-docs.md`; update the protected plan only for verified completions, update all live state/decision files, commit, push, and report every remaining blocker. Do not declare the roadmap complete with any failed/unavailable gate.
  Parallelization: Final verification wave | Blocked by: Todos 1-10 | Blocks: none | Can parallelize with: F1-F4 with isolated evidence paths
  References (executor has NO interview context - be exhaustive): `.omo/plans/waha-command-center.md:241-263`; `.claude/AGENT_RULES.md`; `.claude/CODING_STANDARDS.md`; `.claude/SECURITY_STANDARDS.md`; `.claude/ENVIRONMENT_GUIDE.md`; `README.md`; all `.omo/evidence/` generated by this plan.
  Acceptance criteria (agent-executable): F1-F4 each has an independently reproducible command/result/evidence file; all are APPROVE or explicitly BLOCKED with root cause and next action. The final state includes exact commit/push SHA, clean worktree, no secret scan matches, and no unsupported product-scope claims.
  QA scenarios (name the exact tool + invocation): happy: run all four final commands in parallel and obtain four approving reports; failure: inject a temporary unmapped plan requirement, secret-like fixture, forbidden scope term, or unavailable dependency and confirm the appropriate gate fails before cleanup. Evidence `.omo/evidence/final-plan-compliance.md`, `.omo/evidence/final-security-quality.md`, `.omo/evidence/final-e2e.md`, `.omo/evidence/final-scope-docs.md`.
  Commit: Y | `docs(release): record final gate results`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — run `npx --yes pnpm@10.12.4 verify:requirements --plan .omo/plans/waha-command-center.md`; assert every original Must-have has an implementation/test reference and every Must-NOT-have has a negative assertion. Save `.omo/evidence/final-plan-compliance.md`.
- [ ] F2. Code quality and security review — run `npx --yes pnpm@10.12.4 lint`, `typecheck`, `audit --audit-level=high`, and `secret-scan`; run the independent review skill against the final diff. Any high vulnerability, secret match, type/lint failure, or cross-scope leak blocks approval. Save `.omo/evidence/final-security-quality.md`.
- [ ] F3. Real executable QA — run the focused release E2E matrix against disposable PostgreSQL and deterministic/mock WAHA; assert one scheduled send, recovery states, bounded retries, no duplicate dispatch, notification toggles, confirmation-gated purge, encrypted restore, and AI `not_sent`. Save `.omo/evidence/final-e2e.md`.
- [ ] F4. Scope fidelity and documentation review — run `npx --yes pnpm@10.12.4 verify:scope` and `docs:check`; assert no forbidden MVP UI/API path or public WAHA exposure and that README/setup/security/operations/state docs match actual behavior. Save `.omo/evidence/final-scope-docs.md`.

## Commit strategy

- Each Todo 14/15/16 tranche is one or more focused Conventional Commits, with implementation and its tests together where inseparable.
- After the tranche’s exact QA commands pass and evidence is written, run `GIT_MASTER=1 git status`, `git diff --check`, inspect the staged diff, commit with the repository footer, and `GIT_MASTER=1 git push origin main`.
- If a phase is blocked by the environment, commit only the redacted evidence/state needed to preserve the blocker; do not mark the phase complete or push speculative code.
- Final F1-F4 evidence and state updates are committed/pushed only after all reports are collected and reconciled.

## Success criteria

- Todo 14’s required authenticated dashboard acceptance is green at the real browser/API seams or has an explicit, evidenced environment blocker with no false completion claim.
- Todo 15’s external mode is runnable and secure; bundled mode is either verified against an exact tested image reference or explicitly blocked by the registry prerequisite.
- Todo 16’s release matrix and repository-local verification commands are reproducible, redacted, and cleanup-safe.
- F1-F4 each has an evidence artifact and an APPROVE/BLOCKED result; no unresolved failure is hidden.
- Every completed tranche has a clean worktree, an atomic commit, and a verified `origin/main` parity check.
- The original product boundaries remain intact: one tenant, hard scope separation, Admin-created users, explicit grants, server-side WAHA credentials, one-time text scheduling, human-approved AI, and no media/campaigns/broadcasts/autonomous sending/scraping/spam/stealth.
