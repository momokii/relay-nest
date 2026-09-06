# F2 Code Quality Review: WhatsApp Composer and Sent History

Date: 2026-09-04
Scope: changed WhatsApp formatting, composer, UI, sent-history API/repository, client API, and related styles/tests.

## Verification

- `npx --yes pnpm@10.12.4 typecheck` — **PASS** (`tsc -b --pretty false`).
- Scoped `npx --yes pnpm@10.12.4 exec biome check` over the changed source and test files — **PASS** (`Checked 20 files`, no fixes).
- `git diff --check` — **PASS**.
- Full `npx --yes pnpm@10.12.4 exec biome check` — **FAIL**. It reported existing/unrelated diagnostics in `apps/api/src/app-session-service.ts` and `apps/api/src/waha/*`, generated `.tmp/playwright-t5.config.ts`, and host `/etc`/`/usr/share` paths. It also reported formatting changes in changed `apps/web/src/components/overview-pages.tsx`.

## Review findings

### F2-1 — Blocker: prohibited `innerHTML` API remains

`apps/web/src/components/message-composer.tsx:270-273` renders the preview with `dangerouslySetInnerHTML`. The file-level Biome suppression does not satisfy the requirement to have no `innerHTML`; the implementation still uses the prohibited DOM sink. No `execCommand` usage was found under `apps/`.

The preview parser escapes text and only emits a fixed allowlist of tags, which is a useful security property, but it does not remove this explicit code-quality violation. Replace the sink with a React-node renderer (or render escaped plain text if rich preview is not required).

### F2-2 — High: changed composer exceeds the module size ceiling

`apps/web/src/components/message-composer.tsx` is 346 lines (pure source lines), above the project programming standard's 250-line ceiling. The new formatting toolbar/preview behavior is a separable responsibility and should be extracted before approval.

`apps/api/src/sent-history.test.ts` is 260 lines; this is also above the same ceiling, though it is test code and not the primary F2 blocker.

## Positive checks

- TypeScript compilation passed; changed APIs use Zod schemas and inferred response types.
- The sent-history route checks scoped authorization before querying/decrypting and projects only bounded/redacted fields.
- Added CSS uses the existing design-token variables (`--color-*`, `--space-*`, `--type-*`, and `--radius-*`); no new raw color, spacing, or typography literals were found in the added composer/history styles.
- Scoped Biome formatting/linting passed for the reviewed changed files.
- The formatter parser has regression coverage for escaping hostile markup and unmatched/escaped delimiters.

## Verdict

**FAIL — not approval-ready.** Type safety and scoped formatting pass, but F2 remains blocked by the explicit `dangerouslySetInnerHTML` usage. The composer module-size finding should be addressed in the same quality pass. Full-repository Biome also does not pass in the current worktree; its diagnostics include unrelated/generated and host-path noise, plus a formatting diagnostic in changed `overview-pages.tsx`.
