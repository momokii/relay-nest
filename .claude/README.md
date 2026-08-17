# Agent Orientation

RelayNest is an in-progress self-hosted WAHA WhatsApp command center for one
tenant, multiple users, multiple sessions, and hard-separated Personal and
Business scopes. Todos 1-12 are implemented in local history. Todo 12
retention, scoped purge, immutable content-free audit accountability, encrypted
backup/restore, and key-rotation guidance are also implemented and focused-
verified, including its scheduler concurrency regression fix. Its implementation
and evidence are committed locally; final plan gates remain open.

## Required sequence

Read `HOW_TO_RESUME.md`, `state/CURRENT_STATUS.md`, `state/TASK_QUEUE.md`,
`AGENT_RULES.md`, `CODING_STANDARDS.md`, `SECURITY_STANDARDS.md`, and
`ENVIRONMENT_GUIDE.md` before editing. Then read task-specific product,
architecture, API, operations, and threat-model docs. Verify environment and
relevant checks before and after changes.

## State and source of truth

`state/CURRENT_STATUS.md` records live progress and worktree truth;
`TASK_QUEUE.md` records dependency order; `DECISIONS_LOG.md` records durable
decisions; `.omo/evidence/` records verification. Verified source/tests/evidence
take precedence over stale progress text. `CONTEXT.md` defines domain terms.

`.omo/plans/waha-command-center.md` is the protected approved-scope plan and
`.omo/start-work/ledger.jsonl` is the protected execution ledger. Do not rewrite
either to make progress appear complete; report discrepancies instead.

## Security baseline

Keep WAHA credentials server-side and bundled WAHA internal. Enforce
deny-by-default, server-side authorization and scope checks; validate boundaries;
redact secrets/content; preserve CSRF/same-origin, encryption, immutable audit,
and backup fail-closed behavior. WAHA `WORKING` and HTTP acceptance are not
recipient-delivery proof, and unofficial-client ban risk cannot be eliminated.

At session end update only relevant state files with verified facts, exact test
results, unresolved gates, and cleanup status. Never expose secrets or claim
commit/push without evidence.
