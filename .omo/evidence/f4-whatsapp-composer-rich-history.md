# F4 — Scope fidelity: whatsapp-composer-rich-history

## Result

**CONDITIONAL PASS.** The feature changes preserve the requested product
boundaries and the sent-history authorization path is covered. The repository
scope verifier is not green because it flags the feature plan's negative phrase
`no scope bypass` as `scope-required`; this is a checker false positive in the
plan wording, not an implementation path. `docs:check` is green.

## Scope review

Plan: `.omo/plans/whatsapp-composer-rich-history.md`, Scope sections (lines
21–34).

| Requirement | Finding | Evidence |
| --- | --- | --- |
| Textarea composer; no `contenteditable`/WYSIWYG | PASS | `apps/web/src/components/message-composer.tsx` uses a controlled `<textarea>` and selection APIs. No `contenteditable` match in API or web source. |
| No WAHA credential exposure / no client `X-Api-Key` | PASS | No `X-Api-Key`/`x-api-key` match in `apps/web/src`. Existing key use remains server adapter/Compose healthcheck only; `secret-scan` passed. |
| No cross-scope or cross-session history leakage | PASS | `apps/api/src/sent-history.ts:84-100` validates the requested scope role before repository access, then filters the returned rows by the requested scope before projection/decryption. `apps/api/src/db/repositories/sent-history.ts:20-27` joins `sessionGrants` on user, session, and identical account scope before rows reach projection. |
| `hasGrant` before decryption | PASS | Production repository grant join occurs before `projectSentHistoryRow`; API test `apps/api/src/sent-history.test.ts:145-168` proves a caller without the scoped role receives 403 without repository query, and lines 170–196 prove mismatched-scope rows are removed before projection. |
| Bounded reads | PASS | Route caps page size at 50 (`sent-history.ts:22,89`); repository bounds limit/offset and requests only `boundedLimit + 1` rows (`db/repositories/sent-history.ts:15-16,29-34`); snippet is capped at 80 (`sent-history.ts:64`). Pagination tests passed. |
| Personal/Business scope intact | PASS | Scope is required by the route schema and passed through API/repository queries. Scope-denial and cross-scope tests passed; UI history is keyed by scope and requests the active scope only. |
| No inbox sync or campaign logic | PASS | No inbox/campaign/sync implementation was added in changed API source or the new history panel. `sent-history-panel.tsx` calls only `/scoped/sent-history`; it does not fetch WAHA chats/messages. No campaign/broadcast endpoint was added. |
| Design system not refactored beyond icon | PASS | The UI diff adds feature-local composer/history styles and changes the existing InfoHint icon treatment only; existing token variables and shared layout primitives remain in use. No broad design-system module or token refactor was found. |

## Must-NOT-have static review

- No media, recurring jobs, campaigns, broadcasts, autonomous sending,
  scraping, spam, stealth, or inbound chat sync strings/paths were found in
  the changed API source. The composer retains the existing explanatory
  `no media or broadcast targets` copy only; it is not an implementation.
- No `contenteditable` or `execCommand` usage was found.
- No browser source contains a WAHA API key header or provider secret.
- The new history API exposes projected fields only; encrypted ciphertext and
  full message text are not in the response object.

## Verification commands

| Command | Result |
| --- | --- |
| `npx --yes pnpm@10.12.4 run docs:check` | PASS |
| `npx --yes pnpm@10.12.4 run secret-scan` | PASS |
| `npx --yes pnpm@10.12.4 typecheck` | PASS |
| `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts` | PASS: 8 tests |
| `npx --yes pnpm@10.12.4 exec vitest run tests/release-scope.test.ts` | 8/9 passed; current-repository test fails on the plan wording diagnostic below |
| `npx --yes pnpm@10.12.4 run verify:scope` | FAIL: `.omo/plans/whatsapp-composer-rich-history.md:9 scope-required` for the negative phrase `no scope bypass` |
| Static searches in `apps/api/src` and `apps/web/src` for prohibited implementation terms | PASS, no implementation matches; one existing UI copy match for `broadcast targets` |

## Residual risk / disposition

The F4 gate should remain **conditional** until the scope verifier is rerun
with the false-positive plan wording corrected or the checker is taught to
ignore approved plan guardrail prose. No application-source scope violation
was found. Browser Playwright execution is not claimed here because prior
feature evidence records the repository global web server failing to start in
this environment.
