# F3 — WhatsApp composer and sent-history browser/API QA

## Verdict

**APPROVE.** Agent-executed headed Chromium and authenticated API evidence now
covers the requested happy and failure paths. All claims below point to an
exact invocation and an existing artifact.

## Exact invocations

```text
COMPOSER_QA=1 xvfb-run -a npx --yes pnpm@10.12.4 exec playwright test tests/composer.spec.ts --config=/tmp/qa-fix3-playwright.config.ts --headed --workers=1 > /tmp/qa-fix3-composer-run.txt 2>&1
npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts -t "Viewer without a session grant|no scoped role" > /tmp/qa-fix3-scope-denial.txt 2>&1
```

The headed invocation passed all 6 composer tests. The API invocation passed
both authenticated principal scope-denial tests. The temporary Playwright
config points at the repository's `tests/e2e/global-setup.ts` and
`global-teardown.ts`; the checked-in config intentionally discovers only
`tests/e2e`.

## Capture matrix

| Component | Happy capture | Failure/adversarial capture | Result |
|---|---|---|---|
| Enter/breakline | `/tmp/qa-fix3-composer-enter.txt`, `/tmp/qa-fix3-composer-enter.png` — value is `hello\nworld`, `submitted: false` | The same headed test asserts Enter does not submit and records `submitted: false` | PASS |
| Toolbar/lists | `/tmp/qa-fix3-composer-bullet.txt`, `/tmp/qa-fix3-composer-bullet.png`; `/tmp/qa-fix3-composer-numbered.txt`, `/tmp/qa-fix3-composer-numbered.png` — `- ` and `1. ` markers inserted | `/tmp/qa-fix3-composer-toolbar-empty.txt`, `/tmp/qa-fix3-composer-toolbar-empty.png` — empty Bold selection yields `**` and textarea remains focused | PASS |
| Preview parity | `/tmp/qa-t2.txt`, `/tmp/qa-t2.png` and the existing rich-preview assertion in the headed run | `/tmp/qa-fix3-composer-malformed.txt`, `/tmp/qa-fix3-composer-malformed.png` — unclosed marker and `<script>` text remain literal; `scriptCount: 0` | PASS |
| Tooltip icon/accessibility | `/tmp/qa-t2.txt`, `/tmp/qa-t2.png` — open tooltip has matching `aria-describedby` and `role=tooltip` | `/tmp/qa-fix3-tooltip-escape.txt`, `/tmp/qa-fix3-tooltip-escape.png`; `/tmp/qa-fix3-tooltip-blur.txt`, `/tmp/qa-fix3-tooltip-blur.png` — closed state has `ariaExpanded: "false"`, no description, and zero tooltips | PASS |
| Authenticated scope denial | Authenticated browser setup completed during the headed invocation; authenticated Personal dashboard requests are recorded in `/tmp/qa-fix3-composer-run.txt` | `/tmp/qa-fix3-scope-denial.txt` — authenticated principals requesting ungranted Business scope receive 403 and repository access remains false | PASS |

## Related sent-history coverage

- `/tmp/qa-t5.txt` and `/tmp/qa-t5.png` contain the headed sent-history happy
  path, including rows, pagination, and scope clearing.
- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts`
  passed 9 tests in the earlier fix-forward run; output is `/tmp/qa-fix3.txt`.
- The focused scope-denial invocation above is the current authenticated
  failure capture and avoids recording credentials, recipients, message text,
  or provider values.

## Verification

- `npx --yes pnpm@10.12.4 typecheck` — PASS after the capture hooks.
- `npx --yes pnpm@10.12.4 exec biome check tests/composer.spec.ts tests/tooltip.spec.ts apps/api/src/sent-history.test.ts` — PASS.
- `git diff --check` — PASS.
