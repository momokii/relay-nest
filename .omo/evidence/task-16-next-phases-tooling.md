# Todo 9 release tooling evidence

**Date:** 2026-08-27
**Result:** VERIFIED IMPLEMENTATION EVIDENCE, TODO 9 REMAINS OPEN

This report records the repository-local release verification commands already
implemented and pushed. It does not mark Todo 9, Todo 16, or F1-F4 complete.
All output below is redacted. No credentials, message content, raw source,
absolute paths, stack traces, or uncontrolled services were used.

## Baseline

- Environment: local development workstation. `APP_ENV` was unset.
- Branch: `main`, tracking `origin/main`; the pre-change worktree was clean and
  local and remote refs were synchronized.
- `.env` is ignored by Git.
- The package manifest declares the four commands and pins pnpm to `10.12.4`.
- Protected `.omo/plans/*` and `.omo/start-work/ledger.jsonl` were read only.

## Happy-path command receipts

Each command was run from the repository root with the pinned wrapper. Every
command exited `0`; each emitted only its pnpm lifecycle header and the wrapped
Node command, followed by no diagnostic lines.

```text
$ npx --yes pnpm@10.12.4 run verify:requirements
> waha-command-center@ verify:requirements
> node --experimental-strip-types scripts/release-checks.mts requirements
exit 0

$ npx --yes pnpm@10.12.4 run secret-scan
> waha-command-center@ secret-scan
> node --experimental-strip-types scripts/release-checks.mts secrets
exit 0

$ npx --yes pnpm@10.12.4 run verify:scope
> waha-command-center@ verify:scope
> node --experimental-strip-types scripts/release-checks.mts scope
exit 0

$ npx --yes pnpm@10.12.4 run docs:check
> waha-command-center@ docs:check
> node --experimental-strip-types scripts/release-checks.mts docs
exit 0
```

The explicit requirements invocation from the plan also passed:

```text
$ npx --yes pnpm@10.12.4 verify:requirements --plan .omo/plans/waha-command-center.md
exit 0, no diagnostics
```

## Focused release suite

```text
$ npx --yes pnpm@10.12.4 exec vitest run tests/release-*.test.ts
Test Files  13 passed (13)
Tests       101 passed (101)
exit 0

$ npx --yes pnpm@10.12.4 exec vitest run tests/release-package.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)
exit 0
```

The suite completed in about 50 seconds. The package manifest test directly
checks all four package command mappings and the pinned command entry point.

## Intentional-failure receipts

The focused tests execute each mutation in an isolated temporary copy and
restore or remove it in `finally` cleanup. The following are observed classes,
with the test assertions providing the exact failure rule and nonzero result.

| Mutation | Expected result | Observed coverage |
|---|---|---|
| Unmapped requirement or missing canonical requirements section | nonzero, requirements mapping or canonical-section rule | `release-requirements.test.ts`, `release-requirements-integrity.test.ts` |
| Comment-only negative evidence or marker-only Must-NOT-have evidence | nonzero, evidence integrity rule | `release-requirements-integrity.test.ts` |
| Missing referenced evidence, parent/absolute plan boundary, symlinked plan/evidence | nonzero, bounded plan/evidence rule | `release-requirements.test.ts`, `release-requirements-integrity.test.ts` |
| Comment-prefixed secret assignment, credential URL, private-key header | nonzero, secret rule; sensitive value is excluded from diagnostic | `release-secret-scan.test.ts` |
| Cross-scope fixture or neutralized `accountScope` contract | nonzero, scope rule | `release-scope.test.ts` |
| Stale release claim, forbidden link, broken anchor, checked blocked marker | nonzero, freshness/link/structure rule | `release-docs-freshness.test.ts`, `release-docs-links-basic.test.ts`, `release-docs-structure.test.ts` |
| Root or descendant symlink, oversized/deep/wide input, link-budget amplification | nonzero, bounded input rule; no target content is returned | release secret, scope, requirements, docs traversal, and docs budget suites |

The direct CLI probes independently produced these redacted receipts:

```text
$ node --experimental-strip-types scripts/release-checks.mts invalid
<cli>:0 invalid-input use one of: requirements, secrets, scope, docs
exit 2

$ node --experimental-strip-types scripts/release-checks.mts docs --bad value
<cli>:0 invalid-input use --root <path> and --plan <path>
exit 2

$ node --experimental-strip-types scripts/release-checks.mts docs --root <missing-temp-root>
<root>:0 documentation-scan-input provide a bounded documentation root
exit 1

$ node --experimental-strip-types scripts/release-checks.mts requirements --plan <absolute-plan>
<plan>:0 requirements-plan-boundary provide a relative plan path contained within --root
exit 1
```

No intentional-failure output contained the injected secret, source prose,
message content, temporary root name, absolute path, stack trace, or
credential-bearing URL.

## Cleanup receipts

- The direct boundary probe created one uniquely named temporary directory
  under `/tmp`, removed it explicitly, and verified it no longer existed.
- Release tests created disposable copied roots and removed them through their
  existing cleanup paths. No copied root, fixture mutation, or generated test
  artifact remained afterward.
- No PostgreSQL, WAHA, browser, Compose, port, container, volume, network, or
  external service was started by this evidence run.
- The final pre-edit worktree had no task-owned files. Post-edit cleanup is
  verified by the final Git status and diff checks recorded at commit time.

## Adversarial coverage and applicability

- New CLI/input parsing: applicable, invalid command, option, root, and plan
  boundary probes passed with safe exit codes.
- Stale state: applicable, documentation freshness and checked blocked-marker
  tests reject misleading release claims.
- Dirty worktree: applicable, baseline and final Git status checks are required;
  no unrelated dirty files were present at baseline.
- Long or flaky commands: applicable, the full focused suite completed once in
  about 50 seconds; no retry or false-success output was recorded.
- Misleading success output: applicable, intentional mutations assert nonzero
  exits and diagnostic rules rather than trusting text alone.
- Generated artifacts: applicable, release traversal excludes generated paths;
  no generated artifact was retained.
- Repeated interruptions: not applicable to this non-interactive, completed
  local command run; bounded traversal and `finally` cleanup are covered by
  regression tests.
- Real credentials, external WAHA, external scanners, and browser E2E: not
  applicable and not claimed; this task covers repository-local tooling only.

## Known limitations

- Full lint remains affected by the pre-existing analytics fixture/workstation
  diagnostics. This evidence does not claim full lint is green.
- The full PostgreSQL `28P01` authentication boundary remains an environment
  limitation. No database result is claimed here.
- The exact bundled WAHA image is unavailable, and the supported bundled WAHA
  secret boundary is unavailable. No bundled runtime result is claimed.
- No external scanner or E2E result is claimed unless explicitly recorded in
  another evidence artifact.

## Closeout classification

The release tooling implementation, package commands, focused regression suite,
direct CLI boundaries, redaction behavior, and disposable cleanup are evidenced
as passing. Todo 9 remains open pending the plan's later reconciliation gates;
Todo 16 and F1-F4 remain open. No protected plan checkbox or ledger event was
changed.
