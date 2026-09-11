# F4 Scope Fidelity and Documentation Review — EXECUTED (waha-finalize-15-16)

Date: 2026-09-11
Plan: `.omo/plans/waha-finalize-15-16.md` F4 (line 139)
Worktree: `main` at `d123c23` plus the uncommitted finalize-plan changes
(docs refresh, state files, evidence placeholders). Nothing committed or pushed
by this gate.
Previous content of this file: the Todo 9 PENDING placeholder; before that the
2026-08-28 waha-command-center F4 audit (BLOCKED verdict), preserved in git
history (`1d648bd` and ancestors).

## Gate status

**PASS with recorded discrepancies.** Both automated gates exit 0 and every
forbidden-category assertion holds for the MVP surface, with the campaign
exception precisely scoped below. Three documentation-reconciliation gaps
against actual behavior are recorded verbatim in "Adversarial findings" and
are the reason this is not an unconditional approval.

## Automated commands (executed 2026-09-11)

```text
npx --yes pnpm@10.12.4 verify:scope   -> exit 0, zero diagnostics
npx --yes pnpm@10.12.4 docs:check     -> exit 0, zero diagnostics
```

- `verify:scope` (scripts/release-scope.mts) scans all bounded text files for
  scope-separation / unscoped-access / cross-scope violations, enforces
  `accountScope === sessionScope` outside tests, and asserts the three scope
  contract markers (`CONTEXT.md`, `apps/api/src/auth/authorization.ts`,
  `tests/authz.test.ts`).
- `docs:check` (scripts/release-docs-check.mts) validates every required
  source-of-truth document and marker set (scripts/release-docs-rules.mts),
  rejects the `STALE_CLAIMS` completion-claim regexes in ALL repository
  markdown, and verifies local markdown links resolve.

## Forbidden-category assertions (plan line 139)

Adversarial source review at HEAD `d123c23` + worktree; every claim below is
traceable to a file/line in this worktree.

### 1. Media — PASS (no media send path)

- `SendInput` is text-only: `message: string` with no attachment/media field
  (`apps/api/src/messaging-types.ts:154-158`); scheduled job content is the
  same text envelope (`messaging-types.ts:73-77`).
- The only media surface is a read-only preview fetch
  `GET /scoped/sessions/:sessionId/chats/:chatRef/messages/:messageId/media`
  (`apps/api/src/waha/session-http.ts:146`) consumed by the chat-history
  overlay for `<img>` previews (`apps/web/src/components/chat-history-overlay.tsx:130-136`).
  Authenticated, scoped, session-granted. No media composer, upload, or
  media-send UI/API exists.
- Naive `grep -i media` hits are dominated by the `media` substring inside
  `immediate` — dismissed as false positives.

### 2. Recurring jobs — PASS (one-time only)

- `job_origin` pgEnum is `["immediate", "scheduled"]`
  (`apps/api/src/db/schema/shared.ts:15`); every job is a one-time dispatch.
- The scheduler's `intervalMs` (`apps/api/src/scheduler/ticker.ts`) is the
  claim-poll cadence (default 15 s), not a recurrence primitive. No
  cron/rrule/repeat-interval schema, route, or UI exists.

### 3. Campaigns — PASS for the MVP surface, with a precise exception

- **UI path: NOT reachable.** The `campaigns` nav item is rendered disabled
  with `aria-disabled`, `disabled`, and tooltip "Under development — Campaigns
  is not available yet" (`apps/web/src/components/app-shell.tsx:141-154`);
  the view router renders only a warning panel: "Campaigns — Under
  development … Reaction campaigns are flagged as UNSTABLE … The page and its
  actions are disabled until the feature is ready"
  (`apps/web/src/components/dashboard-view-router.tsx:207-216`).
  `CampaignPage`/`CampaignForm`/`CampaignList` are not mounted by the router.
- **API path: EXISTS, extra-MVP, non-public.** `registerCampaignRoutes` and
  `registerContactGroupsRoutes` are live in the real runtime
  (`apps/api/src/app.ts:225-227`) at `/scoped/campaigns` and
  `/scoped/contact-groups`; every route requires authentication, enforces
  Personal/Business scope filtering, and rejects viewers without the campaign
  grant (`apps/api/src/campaigns-http.test.ts:61-110`). The reaction-triggered
  1:1 follow-up is wired (`apps/api/src/app.ts:188-194`, dedupe key
  `campaign:{id}:reaction:{participant}:{messageId}`).
- **Sanction:** this surface is NOT part of the MVP plan
  (`.omo/plans/waha-command-center.md:44` excludes campaigns). It was added by
  the separate approved plan `.omo/plans/group-reaction-campaign.md`, whose
  todos G1-G7 and gates F1-F4 are ALL checked complete, and whose own "will
  NOT do" line still forbids broadcasts, media beyond group text, cross-scope
  leakage, and WAHA credential exposure.
- **Verdict:** no MVP UI/API path for campaigns exists; the extra-MVP campaign
  API is authenticated + scoped + granted with its UI deliberately gated off
  and flagged UNSTABLE. The gate assertion holds as written ("MVP UI/API
  path").

### 4. Broadcasts — PASS

No broadcast route, service, scheduler path, or UI exists anywhere under
`apps/api/src` or `apps/web/src`. The only hits are exclusion statements in
docs/plans.

### 5. Autonomous sending — PASS

- AI approval schema requires `approved: z.literal(true)`
  (`apps/api/src/ai/http.ts:10-14`); approval records human approval and does
  not dispatch (Todo 14 evidence: approval leaves dispatch count at zero;
  drafts are sent only through the human-initiated composer).
- Every dispatch is human-configured: immediate/scheduled text sends,
  human-approved AI drafts, or campaign/reaction follow-ups whose message text
  and trigger were pre-configured by a human and pass safety checks, dedupe,
  scope/grant authorization, and audit (`apps/api/src/campaigns/reaction-trigger.ts`).

### 6. Public registration — PASS

- `/auth/bootstrap` fails closed once any user exists:
  `if (existingUsers.length > 0) throw new AuthFailure("bootstrap already
  completed")` under a `pg_advisory_xact_lock`
  (`apps/api/src/auth/service.ts:56-58`); repeat bootstrap returns 409
  (compose-default-admin-bootstrap evidence).
- User creation is only `POST /admin/users` (Admin-gated, `auth/http.ts:91`)
  plus Admin disable/enable/reset-password. No `/auth/register` or
  open-signup route exists.

### 7. Public WAHA API exposure — PASS

- Compose publishes exactly one host port: `web` on
  `${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080}:4173`
  (`docker-compose.yml:65-66`). `api` is `expose: "3000"` internal-only;
  bundled `waha` has no host port (internal 3000 only); re-verified by
  finalize Todos 1-2 `docker compose config` receipts (task-15 evidence).
- WAHA credentials are server-side only: Admin-entered and encrypted, or
  file-based Docker secret for bundled WAHA; never in `.env`, resolved
  Compose config, browser storage, or logs (task-15/task-16 evidence).
- The only inbound WAHA-facing surface is `/api/webhooks/waha/*`; the handler
  is registered only when a webhook secret is configured
  (`apps/api/src/waha/webhook-http.ts:92-97`, secret loaded from
  `WAHA_WEBHOOK_SECRET_FILE` with empty-value fail-closed at lines 18-22).

## Documentation fidelity (README / setup / security / operations / .claude/)

### Matches actual behavior

- `README.md`: implemented-scope list, MVP exclusion sentence, ban-risk
  paragraph with the full mitigation list and the "cannot guarantee account
  safety or recipient delivery" disclaimer, loopback default
  (`WEB_BIND_ADDRESS`/`WEB_PORT`), one-click bundled + external Compose setup
  with `.secrets/*` file precedence, release-check list, and deferred
  limitations — all consistent with the Compose files and `docs/operations.md`.
- `docs/operations.md`: documents the digest-pinned bundled runtime
  (`Dockerfile.waha` over `devlikeapro/waha:latest-2026.8.1@sha256:d52ad4f3…`,
  `deploy:bundled`/`dev:bundled`), and explicitly marks the earlier
  "configuration-only until the image is available / fail-closed blocker / no
  supported secret-file mechanism" statements as historical release-gate
  records (lines 55-58). File/port rules, loopback default, reverse-proxy
  HTTPS/TLS requirement, secret precedence, backup/restore, and project-scoped
  cleanup match actual behavior (docs:check markers retained deliberately in
  their historical context).
- `docs/threat-model.md`, `docs/waha-capability-matrix.md`,
  `docs/decisions/0001-product-boundary.md`: required markers valid; threat
  model and capability floor statements consistent with the shipped surface.
- `.claude/README.md` (orientation + security baseline),
  `AGENT_RULES.md`, `CODING_STANDARDS.md`, `SECURITY_STANDARDS.md`,
  `ENVIRONMENT_GUIDE.md`: no stale bundled-blocked or completion claims;
  security baseline matches code (deny-by-default, server-side WAHA
  credentials, CSRF/same-origin, fail-closed backup).
- `.claude/state/CURRENT_STATUS.md` and `.claude/state/TASK_QUEUE.md`:
  current — finalize Todos 1-9 recorded with receipts, original Todo 15 DONE,
  Todo 16 IN PROGRESS via finalize Todos 5-9, F1-F4 open. Matches reality
  (this F4 run resolves one of those open gates).

### Adversarial findings (stale_state) — recorded, not silently fixed

1. **CONTEXT.md line 58 is stale against shipped behavior.** It states
   "Media, groups, broadcasts, and campaigns are outside the MVP" and defines
   the text message as the only communication unit. The product now ships
   contact-group CRUD, WAHA group creation, and campaign/reaction APIs
   (approved by `.omo/plans/group-reaction-campaign.md`), with the campaigns
   menu present but disabled. No `Contact group`, `Campaign`, or
   `Reaction follow-up` domain terms exist in CONTEXT.md.
2. **`.claude/state/DECISIONS_LOG.md` has no superseding entry for the
   campaign extension.** The 2026-08-16 "Locked WAHA Command Center product
   decisions" entry still lists campaigns among exclusions; the later approved
   group-reaction-campaign plan (and its completed implementation) is not
   recorded as a durable decision. Per the protected-record discipline, this
   gate records the discrepancy instead of rewriting the log.
3. **README's implemented-work list omits the extra-MVP campaign surface.**
   Campaigns appear only in the MVP-exclusion sentence; a reader is not told
   that contact-group APIs are live and a (disabled, UNSTABLE-flagged)
   Campaigns menu ships in the dashboard.

These three items are documentation-reconciliation work (README sentence,
CONTEXT.md terms, one DECISIONS_LOG entry). They do not widen the executable
scope: no broadcast path, no autonomous dispatch, no public surface, and the
campaign UI is disabled. They are handed back to the orchestrator as the
condition attached to this PASS.

## Verdict

- `pnpm verify:scope` PASS, `pnpm docs:check` PASS (exit 0 both).
- All seven forbidden-category assertions hold for the MVP surface; the
  campaign exception is extra-MVP, plan-sanctioned, authenticated, scoped,
  grant-checked, and UI-disabled with an explicit UNSTABLE flag.
- README/setup/security/operations and `.claude/` state files match actual
  behavior except the three recorded campaign-reconciliation gaps above.

Cleanup: none required (read-only gate; no processes, containers, or temp
files created). No commit or push performed.
