# T3 Composer: rich history

## Change

- `MessageComposer` keeps the controlled `<textarea>` as the message source of
  truth.
- Ctrl/Cmd+B and Ctrl/Cmd+I wrap the current selection with WhatsApp markers;
  toolbar controls cover bold, italic, strikethrough, monospace, bullet, and
  numbered lists.
- Enter is handled with `setRangeText("\n", ...)`, preserving a literal newline
  in the controlled value.
- The live preview uses the T1 `renderPreview` parser and `white-space: pre-wrap`.

## Verification

| Command | Result |
|---|---|
| `npx --yes pnpm@10.12.4 typecheck` | PASS |
| `npx --yes pnpm@10.12.4 exec biome check apps/web/src/components/message-composer.tsx` | PASS |
| `npx --yes pnpm@10.12.4 exec vitest run tests/contact-send-redesign.test.ts` | PASS: 24 tests |
| `npx --yes pnpm@10.12.4 exec playwright test tests/composer.spec.ts --project=chromium --config=composer-playwright.config.ts` | PASS: 2 tests |
| `COMPOSER_QA=1 xvfb-run -a ... playwright test ... --headed --grep "wraps selected"` | PASS; screenshot `/tmp/qa-t3.png`, log `/tmp/qa-t3.txt` |

The temporary Playwright config was removed after the browser run.

## Adversarial probes

The T1 parser probe with `<script>alert(1)</script> *hello* _world_` produced
escaped script text plus the expected `<strong>` and `<em>` tags. User text is
therefore not inserted as executable markup. Empty selections, stale selection
positions after controlled edits, and literal Enter insertion are exercised by
the textarea event path; no `contenteditable` or `execCommand` is used.

## Residual note

The existing composer module is larger than the programming-skill 250-line
guideline; this task kept the requested single-component scope and did not
refactor unrelated composer responsibilities.
