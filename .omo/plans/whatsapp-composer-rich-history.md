# whatsapp-composer-rich-history - Work Plan

## TL;DR (For humans)

**What you'll get:** A WhatsApp-faithful composer that keeps Enter line-breaks, adds Ctrl/Cmd+B/I (+ strike/mono) and bullet/numbered lists with a live preview, a proper info-icon tooltip on analytics, and a scoped “Sent history” list showing who was contacted, when, and the exact delivery state.

**Why this approach:** Keep the textarea as the single source of truth (reliable, plain-text, WhatsApp-compatible) and project encrypted `scheduled_jobs`+`attempts` for history—avoids contenteditable sanitization and new tables.

**What it will NOT do:** No contenteditable/WYSIWYG, no headings/links/tables, no media/campaigns/broadcasts, no inbox sync, no WAHA credential exposure, no scope bypass.

**Effort:** Medium
**Risk:** Medium - touches encrypted persistence, scoped decryption, and WAHA markup parity
**Decisions to sanity-check:** Textarea+preview vs contenteditable; history is inline panel on Send/Schedule (not a separate route); snippet is 80-char escaped preview, phone shown full to granted viewer.

Your next move: approve to start work, or run dual high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Medium, Medium risk, textarea rich composer + proper tooltip icon + scoped sent-history projection

## Scope
### Must have
- C1 Composer: Enter inserts `\n` preserved end-to-end; Ctrl/Cmd+B wraps `*...*`, Ctrl/Cmd+I wraps `_..._`, plus toolbar buttons for bold/italic/strike (`~...~`)/mono (```...```); bullet (`- `, `* `) and numbered (`1. `) lists detected per line; live preview beside textarea rendering to `<strong>/<em>/<s>/<code>/<ul>/<ol>/<li>` with escaped text, unmatched delimiters shown literally.
- C1 Preview parity: preview parser and send payload use same WhatsApp syntax; `*bold*`, `_italic_`, `~strike~`, ```mono```, `- item`, `1. item` all render correctly; `white-space: pre-wrap` preserved.
- C2 Tooltip: replace plain circle SVG in `ui.tsx:100` with Lucide `Info` 16px, keep pill (`--radius-pill`), `--color-info` hover/focus, `aria-label="More information"`, add `aria-describedby` when open, keyboard focus/hover/click-pin, Escape/blur close; no color-only reliance.
- C3 Sent history: new scoped `GET /scoped/sent-history?scope=personal|business&page=&pageSize=` reading `scheduled_jobs` + `dispatch_attempts` for the caller’s granted sessions; decrypts `recipientPhoneCiphertext`, projects `{id, recipientPhone, snippet(80), scheduledFor, createdAt, state(canonical), providerMessageId, attempts}` ordered `createdAt DESC`, paginated (default 20, max 50), `state` preserves canonical `scheduled|queued|attempting|submitted|acknowledged|failed|unknown|cancelled` (never collapse to success/failure), snippet is first line truncated 80 + escaped, phone shown full to granted viewer.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No contenteditable, no headings/links/tables, no media/campaigns/broadcasts, no autonomous sending, no scraping/spam/stealth, no inbound chat sync or threading.
- No WAHA credential exposure to browser, no `X-Api-Key` in client, no provider secrets in logs/evidence/browser storage.
- No cross-scope or cross-session leakage: history must enforce server-derived scope + `hasGrant` + role before any decryption; never trust client-supplied owner.
- No unbounded reads: pagination required, pageSize capped 50, snippet length capped, deterministic ordering.
- No scope-boundary changes (Personal/Business) or internal WAHA network exposure.
- No design-system refactor beyond the single InfoHint icon; keep existing `DESIGN.md` tokens.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + Vitest + Playwright (per your AAAA choice)
- Evidence: .omo/evidence/task-<N>-whatsapp-composer-rich-history.md (one per todo, exact command + assertion)
- Composer parser: Vitest unit for WhatsApp tokenizer (happy + XSS + malformed + over-limit)
- Tooltip/history API: Vitest integration (scoped, role/grant, pagination, decryption failure, unknown state)
- UI: Playwright headed headed for composer shortcuts, preview, tooltip focus/hover/Escape, history pagination and scope denial

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1: T1 WhatsApp parser, T2 Tooltip icon (parallel)
- Wave 2: T3 Composer textarea integration (depends T1), T4 Sent-history API (depends T1)
- Wave 3: T5 History UI panel, T6 Composer toolbar (parallel, depends T3/T4)
- Wave 4: T7 Preview parity & over-limit, T8 Pagination/retention, T9 A11y & scope fidelity (parallel)
- Final: F1-F4 verification wave (parallel, all must APPROVE)

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 | - | T3, T4 | T2 |
| T2 | - | - | T1 |
| T3 | T1 | T5, T6, T7 | T4 |
| T4 | T1 | T5, T8 | T3 |
| T5 | T3, T4 | T9 | T6 |
| T6 | T3 | T9 | T5 |
| T7 | T3 | T9 | T8 |
| T8 | T4 | T9 | T7 |
| T9 | T5, T6, T7, T8 | Final | - |
| F1-F4 | All | - | each other |

## Todos
- [x] T1. WhatsApp parser: tokenize bold/italic/strike/mono and bullet/numbered lists with escaping
  What to do / Must NOT do: Implement `apps/web/src/lib/whatsapp-format.ts` with `parseWhatsAppMarkup(text): AST` and `renderPreview(text): ReactNode` using allow-listed tags only (`strong em s code ul ol li`); escape plain text via `textContent`; treat unmatched delimiters as literal; support `*bold*` `_italic_` `~strike~` ```mono``` `- `/* ` `1. ` per line. Must NOT use `innerHTML` without sanitization nor `execCommand`.
  Parallelization: Wave 1 | Blocked by: - | Blocks: T3, T4
  References (executor has NO interview context - be exhaustive): apps/web/src/components/message-composer.tsx:162, apps/web/src/styles.css:1061, apps/api/src/waha/sessions.ts:118, WAHA Help Center formatting spec, DESIGN.md:221
  Acceptance criteria (agent-executable): `npx --yes pnpm@10.12.4 exec vitest run apps/web/src/lib/whatsapp-format.test.ts` passes; cases: `*b*`→strong, `_i_`→em, `~s~`→s, ```m```→code, `- a\n- b`→ul, `1. a\n2. b`→ol, `<script>alert(1)</script>`→escaped, `*unclosed`→literal.
  QA scenarios (name the exact tool + invocation): Vitest happy: bold/italic/lists; failure: XSS/malformed/empty; Evidence .omo/evidence/task-1-whatsapp-composer-rich-history.md
  Commit: Y | feat(web): add WhatsApp markup parser and preview renderer

- [x] T2. Analytics tooltip: replace circle with proper info icon and a11y
  What to do / Must NOT do: In `apps/web/src/components/ui.tsx:81-110` replace inline circle SVG with Lucide `Info` 16px, keep `role="tooltip"`, add `aria-describedby={hintId}` when open, preserve `aria-label`, `aria-expanded`, `aria-controls`, pill/focus-ring, hover/focus/click-pin and Escape/blur close. Must NOT change Metric layout or DESIGN.md tokens beyond icon.
  Parallelization: Wave 1 | Blocked by: - | Blocks: -
  References: apps/web/src/components/ui.tsx:81,100, apps/web/src/components/overview-pages.tsx:142, apps/web/src/styles.css:414, DESIGN.md:17,221
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/web/src/components/ui.test.tsx` (or existing metric test) passes; Playwright `npx --yes pnpm@10.12.4 exec playwright test tests/tooltip.spec.ts --project=chromium` verifies focus shows tooltip with `aria-describedby`, hover shows, Escape closes.
  QA scenarios: Playwright happy: keyboard focus reveals tooltip; failure: no `aria-describedby` when closed; Evidence .omo/evidence/task-2-whatsapp-composer-rich-history.md
  Commit: Y | feat(web): use proper info icon for analytics tooltip

- [x] T3. Composer: breaklines, shortcuts, and live preview wiring
  What to do / Must NOT do: In `message-composer.tsx:65,162` keep `<textarea>` as source-of-truth; add `onKeyDown` for `Ctrl/Cmd+B` → wrap `*...*` and `Ctrl/Cmd+I` → `_..._` (also `~` and ``` via toolbar), preserve selection/caret via `selectionStart`/`setRangeText`; Enter inserts `\n`; render live preview panel using T1 parser beside textarea with `white-space: pre-wrap`; toolbar buttons for B/I/S/M/Bullet/Numbered. Must NOT switch to contenteditable nor use `execCommand`.
  Parallelization: Wave 2 | Blocked by: T1 | Blocks: T5, T6, T7
  References: apps/web/src/components/message-composer.tsx:65,162, apps/web/src/dashboard-model.ts:120, apps/web/src/dashboard-api.ts:271, DESIGN.md:221
  Acceptance criteria: Playwright `npx --yes pnpm@10.12.4 exec playwright test tests/composer.spec.ts` passes: typing `hello`+Ctrl+B wraps `*hello*`, preview shows `<strong>hello</strong>`, Enter keeps `\n` in value and preview, Bubble: selecting `world`+Ctrl+I wraps `_world_`.
  QA scenarios: Playwright happy: shortcut wrap + preview; failure: no selection inserts `**` with caret between; Evidence .omo/evidence/task-3-whatsapp-composer-rich-history.md
  Commit: Y | feat(web): wire rich composer shortcuts and live preview

- [x] T4. Sent-history API: scoped projection of scheduled_jobs+attempts
  What to do / Must NOT do: Add `GET /scoped/sent-history?scope=&page=&pageSize=` in `apps/api/src/sent-history/*` (or `apps/api/src/scheduled-http.ts` extension) reading `scheduled_jobs` + `dispatch_attempts` for caller’s `hasGrant` sessions, scope from server, decrypt `recipientPhoneCiphertext` via existing `app-session-service` cipher, project `{id, sessionId, scope, recipientPhone, snippet80, scheduledFor, createdAt, state, providerMessageId}` ordered `createdAt DESC`, pageSize 20 default max 50, preserve canonical `state`. Must NOT expose `recipientPhoneCiphertext`, `message` full text, provider keys, nor allow cross-scope; must enforce `authenticate` + `hasGrant` before decryption; must paginate.
  Parallelization: Wave 2 | Blocked by: T1 | Blocks: T5, T8
  References: apps/api/src/scheduler/database.ts:84, apps/api/src/db/schema/scheduling.ts:6, apps/api/src/db/repositories/scheduling.ts:78, apps/api/src/app-session-service.ts, apps/api/src/waha/session-types.ts:70
  Acceptance criteria: `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts` passes: authorized Personal sees only own session rows, Business denied, pageSize 100 capped 50, `submitted` stays `submitted` not success, wrong-key decryption handled.
  QA scenarios: Vitest happy: scoped list returns 2 rows ordered; failure: cross-scope returns 403/empty no leakage, oversize pageSize capped; Evidence .omo/evidence/task-4-whatsapp-composer-rich-history.md
  Commit: Y | feat(api): add scoped sent-history projection

- [x] T5. History UI panel on Send/Schedule
  What to do / Must NOT do: Add `apps/web/src/components/sent-history-panel.tsx` fetching `GET /scoped/sent-history`, rendering table/list with recipient, 80-char snippet (escaped), when (`scheduledFor`/`createdAt` via `toLocaleString`), state badge (all canonical states), providerMessageId truncated, pagination controls; mount on Send and Schedule pages via `view-pages.tsx:59,81`. Must NOT fetch WAHA chat history; must keep Personal/Business scope separation.
  Parallelization: Wave 3 | Blocked by: T3, T4 | Blocks: T9
  References: apps/web/src/components/view-pages.tsx:59, apps/web/src/components/overview-pages.tsx:142, apps/web/src/dashboard-session-api.ts:72, apps/web/src/styles.css:463
  Acceptance criteria: Playwright `npx --yes pnpm@10.12.4 exec playwright test tests/sent-history.spec.ts` passes: after direct send, history shows new row with correct recipient/snippet/state, pagination works, scope switch clears.
  QA scenarios: Playwright happy: send → history row appears; failure: Business scope does not show Personal rows; Evidence .omo/evidence/task-5-whatsapp-composer-rich-history.md
  Commit: Y | feat(web): add sent-history panel to Send/Schedule

- [x] T6. Composer toolbar: B/I/S/M + lists
  What to do / Must NOT do: Add toolbar row above textarea with 6 buttons (B/I/S/M/Bullet/Numbered) that call same insertion as shortcuts; buttons have `aria-label`, keyboard focus, `DESIGN.md` spacing/radius tokens. Must NOT affect submit validation or scope.
  Parallelization: Wave 3 | Blocked by: T3 | Blocks: T9
  References: apps/web/src/components/message-composer.tsx:65, DESIGN.md:69,221
  Acceptance criteria: Playwright verifies toolbar Bold click wraps selection and preview updates; keyboard Tab reaches toolbar.
  QA scenarios: Vitest happy: toolbar inserts `*`/`_`/`~`/```; failure: clicking with no selection inserts pair and focuses textarea; Evidence .omo/evidence/task-6-whatsapp-composer-rich-history.md
  Commit: Y | feat(web): add composer formatting toolbar

- [x] T7. Preview parity + over-limit handling
  What to do / Must NOT do: Ensure preview parser and API payload use identical WhatsApp syntax; enforce `maxLength 4096` post-formatting with stable `400` and no dispatch; escape XSS; treat malformed markup literally. Must NOT dispatch on validation failure.
  Parallelization: Wave 4 | Blocked by: T3 | Blocks: T9
  References: apps/web/src/dashboard-model.ts:120, apps/api/src/messaging-http.ts:46, apps/web/src/lib/whatsapp-format.ts
  Acceptance criteria: Vitest `npx --yes pnpm@10.12.4 exec vitest run apps/web/src/lib/whatsapp-format.test.ts` includes `*unclosed` literal and `<script>` escaped; API test `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/messaging-http.test.ts -t "over limit"` expects 400 and zero scheduler calls.
  QA scenarios: Vitest happy: matched delimiters render; failure: 4097 chars rejected; Evidence .omo/evidence/task-7-whatsapp-composer-rich-history.md
  Commit: Y | feat(web): enforce preview parity and over-limit rejection

- [x] T8. Pagination, retention, and ordering
  What to do / Must NOT do: Enforce `page`/`pageSize` defaults/caps, `orderBy createdAt DESC`, snippet 80, phone masking note (full to granted viewer), retention follows `scheduled_jobs` category, post-purge returns empty not error, backup lifecycle separate. Must NOT expose full message text or allow unbounded reads.
  Parallelization: Wave 4 | Blocked by: T4 | Blocks: T9
  References: apps/api/src/db/schema/scheduling.ts:19, docs/operations.md, CONTEXT.md:39
  Acceptance criteria: Vitest pagination test: `page=2&pageSize=1` returns second row ordered; `pageSize=100` capped 50; snippet length ≤80.
  QA scenarios: Vitest happy: ordered pagination; failure: negative page → 400; Evidence .omo/evidence/task-8-whatsapp-composer-rich-history.md
  Commit: Y | feat(api): enforce sent-history pagination and retention

- [x] T9. A11y and scope fidelity polish
  What to do / Must NOT do: Verify textarea `aria-label`, toolbar `aria-label`s, tooltip `aria-describedby`, history `role="table"` or list semantics, focus rings, `prefers-reduced-motion`, and that Personal/Business scope + role + grant are enforced before decryption for history; redact logs/evidence. Must NOT leave Lucide/Heroicons ambiguity or optional-route ambiguity.
  Parallelization: Wave 4 | Blocked by: T5, T6, T7, T8 | Blocks: Final
  References: DESIGN.md:197, CONTEXT.md:39, .claude/SECURITY_STANDARDS.md:82
  Acceptance criteria: Playwright a11y checks: axe or `getByRole` for tooltip/history, keyboard-only flow passes; API scope denial test still 403.
  QA scenarios: Playwright happy: Tab→toolbar→textarea→history; failure: Viewer without grant sees 403/empty; Evidence .omo/evidence/task-9-whatsapp-composer-rich-history.md
  Commit: Y | feat(a11y): polish composer/history/tooltip a11y and scope checks

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Agent-executed browser/API QA (replaces manual QA)
- [ ] F4. Scope fidelity

## Commit strategy
- One commit per todo (T1-T9) as listed; F1-F4 are checks, not commits. Keep `feat(web)` / `feat(api)` / `fix(a11y)` prefixes per todo.

## Success criteria
- Enter in composer sends literal `\n` preserved via API/encryption/WAHA.
- Ctrl/Cmd+B/I (and toolbar) correctly wrap `*`/`_` and preview shows `<strong>`/`<em>` without XSS.
- Bullet `- ` and numbered `1. ` lists render as `<ul>/<ol>` in preview and survive send.
- Analytics tooltip shows proper Info icon, is keyboard-focusable, has `aria-describedby`, opens on focus/hover, closes on blur/Escape.
- Sent history shows scoped rows with recipient, 80-char snippet, when, canonical state, providerMessageId, paginated 20/50, ordered DESC, no cross-scope leakage.
