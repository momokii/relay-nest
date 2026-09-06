# F1 Plan Compliance Audit: group-reaction-campaign

## Verdict

**NEEDS_FIX**

The seven task evidence paths exist and every G1-G7 item is marked `[x]` in
the protected plan, but the acceptance gates are not all satisfied. In
particular, G2 and G7 explicitly lack their required passing verification, the
workspace typecheck is blocked for G1/G3/G4/G5/G6/G7, and no planned G1-G7
commits exist in git history.

## Evidence-path audit

All required paths exist:

| Todo | Required evidence | Exists | Result |
| --- | --- | --- | --- |
| G1 | `.omo/evidence/task-1-group-reaction-campaign.md` | yes | partial |
| G2 | `.omo/evidence/task-2-group-reaction-campaign.md` | yes | fail |
| G3 | `.omo/evidence/task-3-group-reaction-campaign.md` | yes | partial |
| G4 | `.omo/evidence/task-4-group-reaction-campaign.md` | yes | pass (focused test) |
| G5 | `.omo/evidence/task-5-group-reaction-campaign.md` | yes | pass (focused test) |
| G6 | `.omo/evidence/task-6-group-reaction-campaign.md` | yes | pass (focused test) |
| G7 | `.omo/evidence/task-7-group-reaction-campaign.md` | yes | fail |

No G1-G7 todo is missing an evidence file. This confirms evidence coverage,
not acceptance completion.

## Acceptance-criteria audit

- **G1 — NOT fully met.** The focused `groups.test.ts` command passed (3
  tests), but the plan also requires `pnpm typecheck`; evidence reports it
  blocked by existing/concurrent errors.
- **G2 — NOT met.** Evidence reports the required `contact-groups.test.ts`
  command blocked by PostgreSQL password authentication failure. Typecheck is
  also blocked.
- **G3 — NOT fully met.** The focused `campaigns.test.ts` command passed (3
  tests), but the required workspace typecheck is reported blocked.
- **G4 — Met for its focused acceptance test.** The required
  `webhook-reaction.test.ts` command passed (3 tests), including encryption,
  idempotency, HMAC, and replay coverage. Additional Biome/typecheck checks
  were blocked, but they are not the stated G4 acceptance command.
- **G5 — Met for its focused acceptance test.** The required
  `campaigns-http.test.ts` command passed (4 tests), covering scope, cap, and
  viewer-grant behavior. Workspace typecheck remains blocked.
- **G6 — Met for its focused acceptance test.** The required
  `campaigns/reaction-trigger.test.ts` command passed (4 tests), including
  member, non-member, and duplicate behavior. LSP was unavailable and
  workspace typecheck remains blocked, but the stated focused test passed.
- **G7 — NOT met.** The required Playwright command did not run: evidence says
  `tests/campaign.spec.ts` and the `chromium` project are absent. Therefore the
  required end-to-end flow was not verified.

## F3 requirement check

The plan explicitly requires **F3 agent-executed browser/API QA**, replacing
manual QA. This requirement is not satisfied by the available evidence:

- No `.omo/evidence/f3-group-reaction-campaign.md` exists.
- G7 evidence explicitly states headed Playwright QA was not run and no
  screenshot artifact is claimed.
- G1/G3/G4/G5 task reports describe limited probes or manual/runtime checks;
  these do not substitute for the final F3 gate or the missing campaign E2E.

## Commit audit

The plan requires exactly one commit per G1-G7, with these subjects:

1. `feat(waha): add group client for create/list/participants`
2. `feat(db): add contact groups for campaigns`
3. `feat(api): add campaigns for group scheduling`
4. `feat(waha): ingest message.reaction webhooks`
5. `feat(api): add scoped campaign CRUD`
6. `feat(api): trigger 1:1 follow-up on group reaction`
7. `feat(web): add campaign menu and reaction trigger UI`

Git inspection found no matching commits. `HEAD` is `main` at
`e3171c9`, and the group-reaction implementation and evidence files are
uncommitted in the worktree. Task G2 and G4 evidence also explicitly state
that no commit was created. Thus the commit strategy is not compliant.

## Required fixes before approval

1. Make the G2 focused test pass against a disposable/configured PostgreSQL
   instance and record the command/result.
2. Provide the missing campaign Playwright fixture/configuration and run the
   exact G7 command successfully.
3. Execute and record F3 as agent-run browser/API QA, including the complete
   campaign flow and redacted evidence.
4. Resolve or explicitly reconcile the required workspace typecheck failures
   before claiming the G1/G3-G7 acceptance gates are complete.
5. Create and verify the seven planned commits with the exact subjects above.
