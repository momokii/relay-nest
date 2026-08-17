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

Read `README.md`, then `.claude/README.md`, `.claude/HOW_TO_RESUME.md`,
current status, task queue, agent rules, coding/security standards, environment
guide, and task-specific docs. Confirm branch/worktree, environment, relevant
services, and existing tests before editing.

At the mandatory state-refresh checkpoint, compare state files with verified
source, tests, evidence, and worktree status. Select only the next unblocked
task, and never rewrite protected plan/ledger records to make progress appear
complete.

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
`CURRENT_STATUS.md`, update `TASK_QUEUE.md`, and record durable decisions in
`DECISIONS_LOG.md`. Clean disposable services, ports, temporary files, and
build/debug artifacts.

## Testing and evidence

Every behavior change needs regression coverage. Run the narrowest relevant
tests first, then the required integration/full suite, lint, typecheck, builds,
security/dependency checks, and documentation/link checks where available.
Database and API QA must use isolated disposable resources, capture exact
redacted outputs in `.omo/evidence/`, and include cleanup proof. Never claim an
unavailable scanner or a skipped test passed.

## Git and delivery

Do not commit or push unless the user explicitly authorizes it. When authorized,
use semantic Conventional Commit subjects such as
`fix(auth): preserve unavailable WAHA errors` or `docs: refresh agent state`;
keep commits atomic and inspect the staged diff first. Push only after
independent verification, and only to the configured `origin/main` workflow
after confirming remote/branch context. Never push secrets, generated runtime
artifacts, or protected plan/ledger rewrites.
