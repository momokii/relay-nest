# Fix 1: safe composer preview

## Change

- Removed `dangerouslySetInnerHTML` from `apps/web/src/components/message-composer.tsx`.
- The preview now parses the already-escaped `renderPreview` output with
  `DOMParser` and projects only the allow-listed formatting elements to React
  nodes.

## Verification

| Command | Result |
| --- | --- |
| `npx --yes pnpm@10.12.4 exec biome check apps/web/src/components/message-composer.tsx` | PASS |
| `npx --yes pnpm@10.12.4 typecheck` | PASS |
| `npx --yes pnpm@10.12.4 exec vitest run tests/composer.spec.ts apps/web/src/lib/whatsapp-format.test.ts` | PASS: parser 14/14; browser test run separately below |
| `npx --yes pnpm@10.12.4 exec playwright test qa-fix1.spec.ts --config=.tmp/qa-fix1.config.ts` | PASS: 1/1; temporary config/spec removed after run |

Manual QA captured in `/tmp/qa-fix1.txt`: `<script>alert(1)</script>` remains
text with zero rendered `script` elements, while `*hello*` renders a `strong`
element containing `hello`.
