# T7 verification: preview parity and over-limit rejection

## Changes

- The preview recognizes the same WhatsApp syntax used by the composer payload,
  including `*bold*`, `_italic_`, `~strike~`, ```mono```, `- item`, `* item`,
  and `1. item`.
- Preview text remains HTML-escaped and unmatched delimiters remain literal.
- Dashboard validation and the messaging HTTP boundary reject messages over
  4096 characters. The HTTP boundary trims the message before applying the
  limit and returns only the stable generic 400 response.
- The over-limit route test proves neither immediate nor scheduled messaging
  service is called.

## Verification

| Command | Result |
| --- | --- |
| `npx --yes pnpm@10.12.4 exec vitest run apps/web/src/lib/whatsapp-format.test.ts` | PASS: 1 file, 14 tests |
| `npx --yes pnpm@10.12.4 exec vitest run tests/messaging-http.test.ts -t "over limit"` | PASS: 1 test |
| `npx --yes pnpm@10.12.4 exec vitest run tests/messaging-http.test.ts` | PASS: 1 file, 6 tests |
| `npx --yes pnpm@10.12.4 exec vitest run tests/task-14-dashboard-model.test.ts -t "4096"` | PASS: 1 test |
| `npx --yes pnpm@10.12.4 exec biome check apps/web/src/lib/whatsapp-format.ts apps/web/src/lib/whatsapp-format.test.ts apps/web/src/dashboard-model.ts apps/api/src/messaging-http.ts tests/messaging-http.test.ts tests/task-14-dashboard-model.test.ts` | PASS |
| `npx --yes pnpm@10.12.4 typecheck` | BLOCKED by pre-existing `apps/api/src/sent-history.test.ts:203-204` type errors (`id` and `snippet80` are not properties of the returned row) |

## Manual QA

- Parser cases and their escaped output were captured in `/tmp/qa-t7.txt`.
- The attempted curl against the local development endpoint was captured in
  `/tmp/qa-t7-api.json`. The endpoint redirected to login with HTTP 302, so an
  authenticated live API 400 could not be exercised in this environment; the
  authenticated route behavior is covered by the passing Fastify injection
  test above.
- The manual inputs contained an unclosed marker, a `<script>` payload, and a
  4097-character message. No prompt text was interpreted as instructions.
