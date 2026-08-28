# F4 scope fidelity and documentation audit

Date: 2026-08-28
Repository: RelayNest
Branch: `main`
Environment: `APP_ENV` and `NODE_ENV` were unset. This was a read-only audit.

## Verdict

**BLOCKED.** The F4 repository-local commands passed, and the manual scope and
documentation review found no forbidden MVP implementation path or public WAHA
port exposure. The final gate remains blocked by the unavailable exact bundled
WAHA image, the unverified supported bundled secret boundary, and other open
release limitations. No bundled runtime, native WAHA dashboard parity, real
WhatsApp linking, account safety, or recipient delivery is claimed.

Next action: make the exact pinned image available and establish a supported,
runtime-tested secret boundary that keeps the WAHA credential out of resolved
configuration and inspection. Then rerun the bundled startup, health, UID,
persistence, and cleanup checks, reconcile the remaining final gates, and keep
the blocked status until all required evidence is green or explicitly accepted
as an environment limitation.

## Required command results

Commands were run from the repository root with the pinned pnpm wrapper. Their
diagnostic streams contained no findings.

```text
npx --yes pnpm@10.12.4 verify:scope
exit 0

npx --yes pnpm@10.12.4 docs:check
exit 0
```

`verify:scope` checks scope-separation patterns, scope literal mismatches, and
the repository's canonical scope markers. `docs:check` checks required
documents, required markers, stale release-status patterns, local links, and
bounded traversal. These commands do not prove semantic product truth,
complete API or UI absence, runtime behavior, or delivery behavior. The manual
review below supplies those F4 observations where source and evidence permit.

## Scope-forbidden path review

Reviewed application source, dashboard routes/components, Compose files, the
product boundary plan, and release evidence for these forbidden MVP paths:

| Boundary | Result | Observation |
|---|---|---|
| Media | PASS | No media implementation route or composer was found. References are explicit deferred or unavailable statements and WAHA contract documentation. |
| Recurring schedules | PASS | Scheduling UI and copy state that schedules are one-time; no recurring implementation path was found. |
| Campaigns | PASS | No campaign implementation path was found; the boundary is explicitly deferred. |
| Broadcasts | PASS | No broadcast target or implementation path was found; messaging UI explicitly excludes broadcast targets. |
| Autonomous sending | PASS | AI remains an unavailable or human-approved suggestion seam; no autonomous dispatch path was found. |
| Public registration | PASS | The documented model is Admin-created users with no public registration. No public-registration route was found. |
| Public WAHA exposure | PASS | Compose publishes only `web`; API and bundled WAHA expose internal port `3000` and have no host port mapping. |
| Scraping, spam, stealth, anti-detection, and ban evasion | PASS | These are explicitly excluded in the product, threat, operations, and state documentation. No implementation path was found. |

Terms found in source or evidence are negative assertions, safety warnings,
deferred WAHA capabilities, or browser layout code. They were not treated as
forbidden product implementation.

## Documentation and state consistency

| Area reviewed | Result | Reconciled facts |
|---|---|---|
| `README.md` | PASS | Single tenant, hard Personal/Business separation, one-time text scheduling, server-side WAHA credentials, explicit MVP exclusions, external-only verified mode, and bundled fail-closed wording agree with the inspected source and evidence. |
| Setup and environment | PASS | `.claude/ENVIRONMENT_GUIDE.md` and `docs/operations.md` use the pinned toolchain and explicit Compose file combinations, secret-file precedence, internal ports, migration ordering, health limits, and cleanup rules. |
| Security and threat model | PASS | `.claude/SECURITY_STANDARDS.md` and `docs/threat-model.md` preserve deny-by-default authorization, scope checks, CSRF and same-origin controls, redaction, encryption, internal WAHA, TLS and firewall requirements, and unofficial-client ban risk. |
| Operations | PASS | `docs/operations.md` distinguishes readiness from session linking and recipient delivery, treats external mode as placeholder-provider QA only, and describes bundled mode as blocked before WAHA startup. |
| WAHA capability matrix | PASS | `docs/waha-capability-matrix.md` distinguishes RelayNest dashboard coverage from native WAHA dashboard parity. Native-floor parity remains not implemented and untested. |
| Live state | PASS with open blockers | `.claude/state/CURRENT_STATUS.md`, `TASK_QUEUE.md`, and `DECISIONS_LOG.md` keep F4, Todo 16, and the remaining bundled and full-lint limitations open. Historical entries are treated as snapshots, not current gate results. |
| Protected records | PASS for this audit | The protected plans and execution ledger were not changed by this audit. The pre-existing `.omo/boulder.json` deletion remains untouched. |

The checked documentation does not claim bundled health, native WAHA dashboard
parity, real provider delivery, or account safety. It also does not turn HTTP
acceptance or WAHA `WORKING` into recipient-delivery proof.

## Existing evidence reconciliation

The following relevant artifacts were inspected:

- `.omo/evidence/task-16-next-phases-release.md`
- `.omo/evidence/task-16-next-phases-tooling.md`
- `.omo/evidence/task-15-next-phases-operations.md`
- `.omo/evidence/task-15-next-phases-bundled.md`
- `.claude/state/CURRENT_STATUS.md`
- `.claude/state/TASK_QUEUE.md`
- `.claude/state/DECISIONS_LOG.md`

Their current limitation wording is consistent: the exact bundled image is not
available, bundled runtime acceptance was not performed, no supported runtime
WAHA secret boundary has been established, full lint is not passed, and
unavailable external scanners have no claimed result. The release artifact's
historical clean-worktree receipts are lane-closeout records and do not override
the present dirty worktree.

## Redaction and worktree safety

This report intentionally omits provider URLs, credential-bearing URLs, secret
values, passwords, message text, private identifiers, temporary paths, and raw
logs. Only command names, exit codes, safe statuses, and repository-relative
paths are retained.

The audit made no source, test, README, documentation, state, plan, ledger, or
Compose changes. The only intended new file is this evidence artifact.

## Remaining blockers

1. The exact pinned bundled WAHA image has no available registry manifest.
2. A supported, runtime-tested bundled WAHA credential boundary is unavailable.
3. Full lint remains not passed because of known diagnostics outside this audit.
4. Native WAHA dashboard parity, real provider behavior, account safety, and
   recipient delivery remain unverified by design and must not be represented as
   complete.

These blockers keep F4 and the overall final release decision open.
