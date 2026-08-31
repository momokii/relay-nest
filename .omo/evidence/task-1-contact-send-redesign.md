# Todo 1 verification evidence

Date: 2026-08-30

## Changes verified

- `DESIGN.md` now specifies the single-target selector, consent/session states,
  disabled groups/non-derivable identities, accessibility, and motion behavior.
- Focused regression coverage exists in `tests/task-14-dashboard-model.test.ts`,
  `tests/messaging-resolution.test.ts`, and `tests/contact-send-redesign.test.ts`.
- The superseding live-directory decision is recorded in
  `.claude/state/DECISIONS_LOG.md`.

## Commands

```text
npx --yes pnpm@10.12.4 feature --test-file tests/contact-send-redesign.test.ts --test-name "accepts a pre-resolved contact id" --paths apps/web/src/dashboard-api.ts apps/web/src/components/chat-directory.tsx apps/web/src/components/message-composer.tsx apps/web/src/components/view-pages.tsx apps/web/src/components/dashboard-view-router.tsx apps/web/src/styles.css tests/contact-send-redesign.test.ts
PASS: 1 test passed, 3 skipped; typecheck passed; scoped Biome passed.

npx --yes pnpm@10.12.4 build
PASS: config, domain, contracts, API, and web builds completed.
```

## Manual deterministic QA

`tests/contact-send-redesign.test.ts` rendered the existing composer and
exercised the pre-resolved contact-ID service path. It passed without provider
lookup and denied a contact lacking server consent.

## Known unrelated failures

The broad Vitest invocation also discovered pre-existing PostgreSQL password
authentication failures and a release-doc physical-line expectation mismatch.
Those failures are outside Todo 1 and were not modified.

## Adversarial classes

- malformed input: covered by group/non-derivable recipient assertions.
- stale state: scope/session contract is characterized; no browser persistence added.
- dirty worktree: unrelated existing changes were preserved.
- misleading success output: only exact focused/build outputs are recorded.
- flaky tests, prompt injection, cancel/resume, generated artifacts, hung
  commands, repeated interruptions: not applicable to this deterministic test/docs slice.

## Cleanup

No services, ports, browser sessions, temporary directories, or containers were
created by this verification.
