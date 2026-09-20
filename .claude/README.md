# Agent Orientation

RelayNest is a v1.0.0 self-hosted WAHA WhatsApp command center for one tenant,
multiple users, multiple sessions, and hard-separated Personal and Business
scopes. Original Todos 1-16 and final gates F1-F4 are complete with evidence;
the current release tag is `v1.0.0`. Read the live state files for post-release
work instead of treating historical status sections as current.

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

## Versioning

When asked to release or bump, read `docs/versioning.md` before changing code.
Root `package.json` is the only version source; a bump must update its version
and `CHANGELOG.md` together, pass `pnpm release`, create an annotated `vX.Y.Z`
tag, push that tag, publish one GitHub Release from the matching changelog block,
and verify `/version` plus OCI labels. Do not create a `VERSION` file or
per-package versions; do not move a published tag.

## Security baseline

Keep WAHA credentials server-side and bundled WAHA internal. Enforce
deny-by-default, server-side authorization and scope checks; validate boundaries;
redact secrets/content; preserve CSRF/same-origin, encryption, immutable audit,
and backup fail-closed behavior. WAHA `WORKING` and HTTP acceptance are not
recipient-delivery proof, and unofficial-client ban risk cannot be eliminated.

At session end update only relevant state files with verified facts, exact test
results, unresolved gates, and cleanup status. Never expose secrets or claim
commit/push without evidence.
