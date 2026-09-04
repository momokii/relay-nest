# T1 WhatsApp markup parser evidence

## Changed files

- `apps/web/src/lib/whatsapp-format.ts`
- `apps/web/src/lib/whatsapp-format.test.ts`
- `vitest.config.ts` includes the requested `apps/web/src/lib/**/*.test.ts` test path.

The parser returns escaped HTML strings containing only `strong`, `em`, `s`,
`code`, `ul`, `ol`, and `li` tags. It does not use `innerHTML` or
`execCommand`. Backslash escaping makes formatting delimiters literal.

## Verification

| Command | Result |
| --- | --- |
| `npx --yes pnpm@10.12.4 exec vitest run apps/web/src/lib/whatsapp-format.test.ts` | PASS: 1 file, 12 tests |
| `npx --yes pnpm@10.12.4 typecheck` | PASS |
| `npx --yes pnpm@10.12.4 exec biome check apps/web/src/lib/whatsapp-format.ts` | PASS |
| `node --experimental-strip-types /tmp/qa-t1.mjs > /tmp/qa-t1.txt` | PASS: 6 sample outputs captured |

The temporary QA script was removed after execution. `/tmp/qa-t1.txt` is the
requested manual QA capture.

## Adversarial probes

- Malformed input: unmatched `*unclosed` remains literal; mixed list kinds are
  kept in separate list blocks.
- Prompt injection/XSS: hostile HTML such as `<img ... onerror="...">` is
  escaped, and tests reject non-allow-listed emitted tags.
- Stale state: parsing is a pure function with no module-level mutable state;
  each invocation parses only its supplied text.
- Misleading success output: the parser emits only preview markup and no
  delivery, send, or success status; verification claims above are command
  results only.
