# Agent Orientation

RelayNest is an in-progress self-hosted WAHA WhatsApp command center for one
tenant, multiple users, multiple sessions, and hard-separated Personal and
Business scopes. Todos 1-12 are implemented in local history. Todo 12
retention, scoped purge, immutable content-free audit accountability, encrypted
backup/restore, and key-rotation guidance are also implemented and focused-
verified, including its scheduler concurrency regression fix. Its implementation
and evidence are committed locally; final plan gates remain open.

## Fast feature path

Read this file, `README.md`, `CONTEXT.md`, current status, and the relevant
feature files. Add a focused regression test, then run:

```text
npx --yes pnpm@10.12.4 feature --test-file tests/<regression>.test.ts \
  --test-name "<focused behavior>" --paths <changed-source> <regression-test>
```

Start the local bundled app with:

```text
npx --yes pnpm@10.12.4 dev:bundled
```

Read the full resume, coding, security, and environment documents only when
the feature touches their domain or the user requests release verification.
`release` is the explicit broad-validation path; it is not part of ordinary
feature work.

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
