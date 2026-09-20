# RelayNest agent contract

## Authoritative documentation

- `README.md`: product purpose, implemented scope, setup, security, testing,
  limitations, and links.
- `CONTEXT.md`: canonical domain language.
- `.claude/README.md`: agent orientation and security baseline.
- `.claude/HOW_TO_RESUME.md`: mandatory startup/resume protocol.
- `.claude/AGENT_RULES.md`, `CODING_STANDARDS.md`,
  `SECURITY_STANDARDS.md`, `ENVIRONMENT_GUIDE.md`: operating, code, security,
  and environment rules.
- `.claude/state/CURRENT_STATUS.md`, `TASK_QUEUE.md`, `DECISIONS_LOG.md`: live
  status, dependency queue, and durable decisions.
- `.omo/plans/`: approved scope and acceptance gates.
- `.omo/evidence/`: exact task verification artifacts.
- `.omo/start-work/ledger.jsonl`: protected execution ledger/history.

When sources conflict, user instructions and verified source/tests/evidence
outrank stale state wording; record the discrepancy in live state files.

## Startup and resume

For ordinary feature work, read `README.md`, `.claude/README.md`, `CONTEXT.md`,
the current status, and only the task-relevant module/docs. Check the worktree
and active environment, then start implementing; do not read every historical
evidence file or run release verification first.

Load `CODING_STANDARDS.md`, `SECURITY_STANDARDS.md`, or the full resume protocol
when the change touches their domain, crosses a trust boundary, or the user
explicitly asks for release verification. Never rewrite protected plan/ledger
records to make progress appear complete.

`.claude/state/` is the live progress/decision record; verified source, tests,
and evidence outrank stale wording. The approved plan is
`.omo/plans/waha-command-center.md`; `.omo/start-work/ledger.jsonl` is the
execution ledger. Both are protected: never rewrite, reset, or mark them
complete without explicit authorization.

Keep the locked product boundaries: one tenant, hard Personal/Business scope
separation, Admin-created users, explicit session grants, server-side WAHA
credentials, one-time text schedules, human-approved AI suggestions, and no
media/campaigns/broadcasts/autonomous sending/scraping/spam/stealth.

Never expose secrets or sensitive content. Preserve deny-by-default
authorization, scope checks, CSRF/same-origin controls, encryption, redaction,
and WAHA's internal network boundary. Make the smallest change, add regression
coverage, and do not claim a change is committed or pushed.

Before closing a session, record exact verification and remaining blockers in
the relevant state file only when work spans sessions, changes a durable
decision, or leaves a blocker. Clean disposable services, ports, temporary
files, and build/debug artifacts.

## Versioning

**Release trigger:** When asked to bump, tag, cut, publish, or release a version, read `docs/versioning.md` before editing. Root `package.json` is the only version source (`1.0.0`); `CHANGELOG.md` is the human-readable history. Do not add a `VERSION` file, per-package versions, or an `npm publish` flow.

**Required release sequence:** (1) choose PATCH/MINOR/MAJOR using Conventional Commits and the public-contract change; (2) run the full `npx --yes pnpm@10.12.4 release` gate; (3) in one release commit, bump root `package.json`, move `CHANGELOG.md` `Unreleased` to `[X.Y.Z] - YYYY-MM-DD`, recreate empty `Unreleased`, and refresh comparison links; (4) create annotated tag `vX.Y.Z` on that commit; (5) push the commit and the single tag; (6) publish one non-draft, non-prerelease GitHub Release using the matching changelog block verbatim; (7) verify remote tag, Release URL, OCI labels, and `/version`/`/health` responses. Never move or retag a published version; correct mistakes by issuing a forward version.

**Completion criterion:** Report the root version, release commit, annotated tag object and target, GitHub Release URL/status, exact verification results, and any unavailable external control. `docs/versioning.md` is authoritative for hotfixes, branch/tag protection, and command details.

## Testing and evidence

Every behavior change needs regression coverage. The default feature loop is:

```text
npx --yes pnpm@10.12.4 feature --test-file tests/<regression>.test.ts \
  --test-name "<focused behavior>" --paths <changed-source> <regression-test>
```

This runs only the focused test, project typecheck, and scoped Biome. Use
`npx --yes pnpm@10.12.4 release` only for release/final-gate work or when the
user explicitly requests broad verification. Database/API QA still uses
disposable resources and redacted output; never claim an unavailable scanner or
skipped test passed.

## Git and delivery

Do not commit or push unless the user explicitly authorizes it. When authorized,
use semantic Conventional Commit subjects such as
`fix(auth): preserve unavailable WAHA errors` or `docs: refresh agent state`;
keep commits atomic and inspect the staged diff first. Push only after
independent verification, and only to the configured `origin/main` workflow
after confirming remote/branch context. Never push secrets, generated runtime
artifacts, or protected plan/ledger rewrites.
