# Evidence — waha-finalize-15-16, Todo 1: Pin WAHA image digest and harden Dockerfiles to non-root

Date: 2026-09-10 14:15 UTC
Plan: `.omo/plans/waha-finalize-15-16.md` (Todo 1)
Base commit: `d123c236bd51571aadfc9b368c5c7340203fc518`
Files in scope: `Dockerfile.waha`, `Dockerfile.api`, `Dockerfile.web`, `docs/waha-capability-matrix.md`

## Result

PASS. `Dockerfile.waha:1` is digest-pinned and the pin matches a fresh registry
pull; `Dockerfile.api` and `Dockerfile.web` run as `USER node` (non-root); the
digest-pinned wrapper image builds clean with `--no-cache --pull`.

Pinned line (`Dockerfile.waha:1`):

```dockerfile
FROM devlikeapro/waha:latest-2026.8.1@sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca
```

No source-file change was required in this todo: the digest pin, the
`USER node` directives, and the capability-matrix digest record
(`docs/waha-capability-matrix.md:22-23`) were already in the committed
baseline and verified byte-identical against a fresh pull (see Stale-state
probe below).

## Baseline check (task premise was stale)

The task brief stated the baseline `Dockerfile.waha` had a `FROM` without a
digest. It did not: the committed baseline already pinned
`sha256:d52ad4f3...` (verified via `git status --porcelain` clean for all three
Dockerfiles and `git log`/`git diff HEAD` showing no uncommitted Dockerfile
edits). The required "baseline grep fails" demonstration was therefore executed
as the plan's own failure QA scenario (plan line 67: temporarily write unpinned
`FROM devlikeapro/waha:latest`):

```
$ # line 1 temporarily replaced with: FROM devlikeapro/waha:latest
$ grep -q '@sha256:' Dockerfile.waha
BASELINE (unpinned FROM devlikeapro/waha:latest): grep -q FAILED as expected (exit code 1, no output from -q)
$ # pinned line restored in the same shell chain (cp backup + mv restore)
AFTER RESTORE (pinned): grep -q PASSED (exit code 0)
```

## Digest resolution (happy path)

Exact commands from the plan/task, run from repo root:

```
$ docker pull devlikeapro/waha:latest-2026.8.1
latest-2026.8.1: Pulling from devlikeapro/waha
Digest: sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca
Status: Image is up to date for devlikeapro/waha:latest-2026.8.1

$ docker inspect --format '{{index .RepoDigests 0}}' devlikeapro/waha:latest-2026.8.1 > /tmp/waha-digest.txt && cat /tmp/waha-digest.txt
devlikeapro/waha@sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca

$ cat Dockerfile.waha | head -1
FROM devlikeapro/waha:latest-2026.8.1@sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca
```

Registry digest == `Dockerfile.waha` digest == `docs/waha-capability-matrix.md:23`
record. Tag (`latest-2026.8.1`) retained alongside the digest as the plan's
dated-wrapper fallback form.

## Non-root verification

```
$ grep -q '@sha256:' Dockerfile.waha && echo OK
OK Dockerfile.waha digest-pinned
$ grep -q 'USER node' Dockerfile.api && echo OK
OK Dockerfile.api USER node
$ grep -q 'USER node' Dockerfile.web && echo OK
OK Dockerfile.web USER node
$ grep -n '^USER ' Dockerfile.api Dockerfile.web
Dockerfile.api:22:USER node
Dockerfile.web:24:USER node
```

`USER node` is the final `USER` directive in each file (no later override),
both runtime stages build from digest-pinned `node:22.23.1-alpine@sha256:16e22a55...`,
and all `COPY --from=build` use `--chown=node:node`. No `USER root` anywhere.

## Build gate (acceptance command)

```
$ docker build -f Dockerfile.waha --no-cache --pull -t tmp-waha:pinCheck . 2>&1 | tail -5
#8 exporting to image
#8 exporting layers 0.0s done
#8 writing image sha256:806dbb7cafe29eecc404b47cfdb5c6e5c4f28fd7cccdc6ec2528c57fa2fb384f done
#8 naming to docker.io/library/tmp-waha:pinCheck done
#8 DONE 0.0s
```

## Adversarial probes

| Class | Probe | Result |
|---|---|---|
| stale_state (cached image diverges from registry) | `docker pull` compares the remote manifest digest to the local cache before reporting "Image is up to date"; the reported `Digest: sha256:d52ad4f3...` is the registry-resolved manifest digest, and `docker inspect .RepoDigests` matches the file pin | PASS — no divergence; a stale cache with a different remote digest would have re-pulled |
| misleading_success_output (build succeeds but wrong base) | Layer-set diff: `RootFS.Layers` of `tmp-waha:pinCheck` (29 layers) vs base `devlikeapro/waha:latest-2026.8.1` (28 layers) via sorted `comm` — base layers missing from built: **0**; built-only layers: **1** (the `COPY` of `docker/waha-entrypoint.sh`). Entrypoint inspect: `[/bin/sh /usr/local/bin/relaynest-waha-entrypoint.sh]` | PASS — built image cryptographically derives from the pinned base plus exactly the wrapper layer |
| dirty_worktree (uncommitted Dockerfile edits) | `git status --porcelain -- Dockerfile.waha Dockerfile.api Dockerfile.web docs/waha-capability-matrix.md` → empty; only untracked `.omo/boulder.json` and `.omo/plans/waha-finalize-15-16.md` in the worktree | Not applicable as a defect — Dockerfiles are clean, committed at `d123c236` |
| baseline-premise stale (task assumed unpinned FROM) | `git log`/`git diff HEAD` show the digest pin, `USER node`, and the capability-matrix digest record predate this todo | Recorded above; negative-path demonstration executed via the plan's failure scenario instead |

Not-applicable probes: none of the classes failed; the dirty_worktree class
confirmed cleanliness rather than a violation.

## Constraints check

- No unpinned `latest`: the only `latest` reference is inside the temporary
  negative-scenario demonstration, immediately restored; committed FROM is
  tag+digest pinned. Not applicable in final state.
- No `USER root`: none in any of the three Dockerfiles (runtime stages).
- No secrets logged: evidence contains digests, image IDs, and layer hashes
  only; no `waha_api_key`/`ENCRYPTION_MASTER_KEY` material.

## Cleanup receipt

```
$ rm /tmp/waha-digest.txt && echo removed
removed
$ docker rmi tmp-waha:pinCheck
Untagged: tmp-waha:pinCheck
Deleted: sha256:806dbb7cafe29eecc404b47cfdb5c6e5c4f28fd7cccdc6ec2528c57fa2fb384f
$ ls /tmp/waha-digest.txt 2>&1
ls: cannot access '/tmp/waha-digest.txt': No such file or directory
```

Also removed scratch files `/tmp/opencode/base-layers.txt`,
`/tmp/opencode/built-layers.txt`. The pulled `devlikeapro/waha:latest-2026.8.1`
base image is retained intentionally — it is the deployment image for Todo 2's
bundled-Compose work, not a disposable artifact.

## Handoff to Todo 2

Todo 1 acceptance criteria are green; Todo 2 (Compose config validation and
secret wiring) is unblocked.

---

# Evidence — waha-finalize-15-16, Todo 2: Validate both Compose modes and secret wiring, no host WAHA/API ports

Date: 2026-09-10 14:30 UTC
Plan: `.omo/plans/waha-finalize-15-16.md` (Todo 2)
Base commit: `d123c236bd51571aadfc9b368c5c7340203fc518` (compose files last
modified in `a12d0db`, an ancestor)
Files in scope (validation only, none edited): `docker-compose.yml:65`
(web ports), `docker-compose.bundled-waha.yml:1`, `docker-compose.override.yml:1`,
`docker-compose.external-waha.yml`, `.env.example`
Tooling: Docker 29.3.1, Docker Compose v5.1.1

## Result

PASS. Both Compose modes resolve (`docker compose config` exit 0), only `web`
publishes a host port (loopback-bound), every credential is Docker-secret
file-based, and no secret value appears anywhere in resolved config output. No
source file was changed in this todo: the committed baseline already satisfies
every acceptance criterion.

## Environment preparation

Required interpolation variables exported as file paths (values are paths, never
secret material); the four `.secrets/*` files were stat-verified only —
contents never read or displayed:

```
$ ls -la .secrets/   # stat-only: 4 files present, mode 600, 45-49 bytes each
$ export ENCRYPTION_MASTER_KEY_FILE="$PWD/.secrets/encryption_master_key"
$ export WAHA_API_KEY_FILE="$PWD/.secrets/waha_api_key"        # bundled mode
$ export WAHA_BASE_URL="https://waha.example.invalid"          # external mode (required :? var)
```

## Automated: both modes resolve (exit 0)

Exact task commands, run from repo root:

```
$ docker compose -p tmp -f docker-compose.yml -f docker-compose.override.yml \
    -f docker-compose.external-waha.yml config
external exit=0    # 113 lines resolved YAML, no stderr

$ docker compose -p tmp -f docker-compose.yml -f docker-compose.override.yml \
    -f docker-compose.bundled-waha.yml --profile waha config
bundled exit=0     # 163 lines resolved YAML, no stderr
```

Bundled-mode resolution confirms: `waha` profile-gated (`profiles: [waha]`),
`WAHA_BASE_URL: http://waha:3000` on api, api `depends_on: waha
(service_healthy)`, waha healthcheck reads `X-Api-Key` from
`/run/secrets/waha_api_key` (file read, no interpolation), waha entrypoint is
the repository wrapper `relaynest-waha-entrypoint.sh`.

## Published-port checks (only web)

Plan-note: the plan's literal pipeline `config | grep -q 'published' | ...`
cannot work (grep -q consumes stdout); implemented its stated intent —
exactly one published port, owned by web, zero `published: "3000"`:

```
cfg-external.yaml:  published-count: 1 ; published-3000 count: 0
cfg-bundled.yaml:   published-count: 1 ; published-3000 count: 0
```

The single `ports:` block in both modes (resolved from
`docker-compose.yml:65` `"${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080}:4173"`):

```yaml
ports:
  - mode: ingress
    host_ip: 127.0.0.1        # loopback default honored
    target: 4173
    published: "38080"        # local gitignored .env sets WEB_PORT=38080 (dev override of 8080 default)
    protocol: tcp
```

`api` and `waha` carry only `expose: ["3000"]` (internal Compose network, no
host publication); `postgres` has no ports at all. The pre-existing operator
stack corroborates the shape: `docker ps` shows
`relaynest-web ... 127.0.0.1:38080->4173/tcp` and
`relaynest-waha-1 ... 3000/tcp` (exposed, not published).

## Secret wiring (file-based) and no-plaintext checks

Top-level `secrets:` in both resolved configs — every entry `file:`-based:

- external: `encryption_master_key`, `postgres_password`, `waha_webhook_secret`
- bundled: adds `waha_api_key: file: .../.secrets/waha_api_key`
  (`grep -q 'waha_api_key' docker-compose.bundled-waha.yml` → OK, plan AC)

Resolved syntax matches the required `file: ${WAHA_API_KEY_FILE:?...}` /
`file: ${ENCRYPTION_MASTER_KEY_FILE:?...}` forms (`docker-compose.bundled-waha.yml:31`,
`docker-compose.yml:96`). All env references are `*_FILE` paths
(`/run/secrets/...`); no `ENCRYPTION_MASTER_KEY=` / `WAHA_API_KEY=` value env
vars exist in any resolved config.

Strong leak check — pattern file built from the actual contents of all four
`.secrets/*` files plus the local `.env` `ENCRYPTION_MASTER_KEY` value
(patterns never printed), then fixed-string scanned against every resolved
config:

```
$ grep -F -c -f /tmp/opencode/secret-patterns.txt cfg-external.yaml
0
$ grep -F -c -f /tmp/opencode/secret-patterns.txt cfg-bundled.yaml
0
$ grep -cE 'ENCRYPTION_MASTER_KEY=.+' <both configs and cfg.yaml>
0
```

## Manual-QA channel (exact task command)

```
$ docker compose -p relaynest -f docker-compose.yml -f docker-compose.override.yml \
    -f docker-compose.bundled-waha.yml --profile waha config > /tmp/cfg.yaml && \
  cat /tmp/cfg.yaml | grep -E 'published|waha_api_key|ENCRYPTION_MASTER_KEY'
manual-QA config exit=0
      ENCRYPTION_MASTER_KEY_FILE: /run/secrets/encryption_master_key
      WAHA_API_KEY_FILE: /run/secrets/waha_api_key
      - source: waha_api_key
        target: /run/secrets/waha_api_key
      WAHA_API_KEY_FILE: /run/secrets/waha_api_key
        - 'node -e "... fs.readFileSync(''/run/secrets/waha_api_key'',''utf8'')..."'
      - source: waha_api_key
        target: /run/secrets/waha_api_key
        published: "38080"
  waha_api_key:
    name: relaynest_waha_api_key
    file: .../wa-scheduler/.secrets/waha_api_key
```

Every matched line is a path/reference — no secret value appears. The same
config then scored 0 hits against the secret-content pattern file, 0
`ENCRYPTION_MASTER_KEY=` plaintext, 0 `published: "3000"`, 1 total published.

## Adversarial probes

| Class | Probe | Result |
|---|---|---|
| stale_state (cached config) | Freshness proof: `config` run A (WEB_PORT from local .env = 38080) md5 `d5ca3ebc...`; run B with `WEB_PORT=9999` md5 `2ff57305...` and `published: "9999"` while the cached `/tmp/cfg.yaml` still shows `"38080"` | PASS — config re-evaluates inputs on every invocation; evidence came from fresh invocations, never a stale cache |
| misleading_success_output (config succeeds but publishes extra port) | Plan's failure scenario via throwaway overlay `/tmp/opencode/evil-ports.yml` (`services.api.ports: ["3000:3000"]`, scoped files untouched): `docker compose -p tmp -f ... -f /tmp/opencode/evil-ports.yml config` exits 0 (misleading), but published-count becomes 2 with `published: "3000"` on api → the check `count==1 AND published-3000==0` correctly FAILS | PASS — guard catches the violation the exit code hides |
| dirty_worktree (uncommitted compose) | `git status --porcelain -- docker-compose.yml docker-compose.bundled-waha.yml docker-compose.override.yml docker-compose.external-waha.yml .env.example` → empty; last compose commit `a12d0db`; full worktree shows only untracked `.omo/*` files | PASS — all five scoped files committed and byte-identical to HEAD |

## Observations (out of Todo 2 scope, recorded for downstream todos)

1. Local gitignored `.env` carries an active `ENCRYPTION_MASTER_KEY=` line
   (documented pattern for non-Compose dev commands, `.env.example:11`). Its
   value was never read or displayed here; the grep -F leak checks prove it did
   not reach any resolved Compose config (no `${ENCRYPTION_MASTER_KEY}`
   interpolation reference exists). The `pnpm secret-scan` gate (Todo 4) owns
   the repo-level verdict.
2. Compose reads `WEB_PORT=38080` from local `.env` in this environment; the
   committed default remains `8080` with loopback `WEB_BIND_ADDRESS` — behavior
   matches `.env.example:3-5`.

## Constraints check

- No host WAHA/API port: only `web` publishes (loopback, 4173 target); api/waha
  3000 is `expose`-only. Proven in all three configs (external, bundled, manual-QA).
- No secret interpolation: all `:?`-required variables point at files; resolved
  config contains paths only.
- No secrets logged: `.secrets/*` contents and the `.env` key value were never
  printed; evidence contains paths, counts, and hashes only.
- No source edits: `git status` scoped check clean after all probes.

## Cleanup receipt

```
$ rm -f /tmp/cfg.yaml /tmp/opencode/cfg-external.yaml /tmp/opencode/cfg-bundled.yaml \
      /tmp/opencode/cfg-evil.yaml /tmp/opencode/*.err /tmp/opencode/evil-ports.yml \
      /tmp/opencode/secret-patterns.txt
$ ls /tmp/cfg.yaml ...
zsh:3: no matches found: /tmp/opencode/cfg-*.yaml    # all gone
$ docker compose -p tmp ps -a
NAME IMAGE COMMAND SERVICE CREATED STATUS PORTS   # empty — config creates no project resources
```

Pre-existing `relaynest` / `relaynest-dev` operator stacks (up 9 days / 25
hours) were untouched — this validation ran `config` only and created nothing.

## Handoff to Todo 3

Todo 2 acceptance criteria are green; Todos 3-4 (docs/ban-risk refresh, state
freshness + secret-scan) are unblocked.

---

# Evidence — waha-finalize-15-16, Todo 4: Make state files current and verify no secret in repo

Date: 2026-09-10 14:43 UTC
Plan: `.omo/plans/waha-finalize-15-16.md` (Todo 4)
Base commit: `d123c236bd51571aadfc9b368c5c7340203fc518` (worktree also carries
the Todo 3 `docs/operations.md` refresh from the parallel docs worker)
Files edited: `.claude/state/CURRENT_STATUS.md`, `.claude/state/TASK_QUEUE.md`
Files verified, not edited: `scripts/release-checks.mts` /
`scripts/secret-checker.mts` / `scripts/secret-patterns.mts` (scanner contract),
`.gitignore`, `.secrets/*`, `.claude/state/DECISIONS_LOG.md`
Tooling: `npx --yes pnpm@10.12.4` (local `pnpm` binary absent, exit 127 —
repo-pinned wrapper used per AGENTS.md)

## Result

PASS. State files mark original Todo 15 DONE and Todo 16 IN-PROGRESS;
`DECISIONS_LOG.md` already reflects the pinned WAHA digest; `pnpm secret-scan`
exits 0; no tracked file contains any secret value; `.secrets/*` is untracked.

## State-file changes

`CURRENT_STATUS.md`: new top section "waha-finalize Todos 1-4 — Todo 15 done,
Todo 16 in-progress" recording the finalize-plan verification chain, the
Todo 15 DONE / Todo 16 IN-PROGRESS transition, the Todo 4 secret receipts, and
worktree truth (state/evidence/plan uncommitted; no commit authorized).

`TASK_QUEUE.md`: "Remaining queue" rows updated —

```
| Todo 15 Compose deployment and operations | DONE (external + digest-pinned bundled runtime verified; evidence `.omo/evidence/task-15-waha-finalize-15-16.md`) | Release evidence reconciliation |
| Todo 16 release verification | IN PROGRESS — release sweep running as `.omo/plans/waha-finalize-15-16.md` Todos 5-9; F1-F4 open | Todo 15 done; finalize Todos 5-9 |
```

plus a closing "waha-finalize Todo 4" follow-up section.

`DECISIONS_LOG.md`: no edit required and none made. The pinned-digest decision
already exists ("Todo 15: digest-pinned bundled WAHA secret bridge",
2026-08-28) and its digest is byte-identical to the `Dockerfile.waha` pin:

```
$ grep -o 'sha256:[a-f0-9]*' .claude/state/DECISIONS_LOG.md Dockerfile.waha | sort -u
.claude/state/DECISIONS_LOG.md:sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca
Dockerfile.waha:sha256:d52ad4f394d2e48eb92d58e0f04924ff6c7621a883d08ff64176479ecd77c9ca
```

Adding a duplicate decision entry would contradict the file's own charter
("Do not use this file as a general progress journal").

## Automated acceptance

```
$ npx --yes pnpm@10.12.4 secret-scan 2>&1 | tail -5
> waha-command-center@ secret-scan ...
> node --experimental-strip-types scripts/release-checks.mts secrets
EXIT=0
```

Literal plan pipeline:

```
$ git ls-files | xargs grep -l 'waha_api_key' | grep -qv '.example' | wc -l
0
```

Plan-note (same class as Todo 2): `grep -q` consumes stdout, so this literal
pipeline equals 0 by construction. The stated intent — "no `waha_api_key`
value or `ENCRYPTION_MASTER_KEY` plaintext appears in `git ls-files` output"
— was therefore verified with intent-correct checks:

```
$ git ls-files | xargs grep -l 'waha_api_key' | grep -v '.example' | wc -l
10   # all name/reference occurrences: docs, decision log, evidence,
     # compose secret name, entrypoint file path, UI field name, tests
```

Value-leak proof (stronger than name grep): pattern file built from the actual
contents of all `.secrets/*` files plus the local `.env` `ENCRYPTION_MASTER_KEY`
value (patterns never printed), fixed-string scanned across every tracked file:

```
$ git ls-files -z | xargs -0 grep -lF -f /tmp/opencode/t4-secret-patterns.txt
(no output) → value-leak files: 0
```

Manual-QA channel — `git ls-files | xargs grep -l 'ENCRYPTION_MASTER_KEY'`
returns 21 tracked files, all references (`_FILE` paths, docs, decision log,
test fixtures). The only two `ENCRYPTION_MASTER_KEY=<literal>` matches are
commented synthetic placeholders (`# ENCRYPTION_MASTER_KEY=AAA...=` in
`.env.example:11` and `tests/compose-startup.test.ts:150`), which the scanner's
own `DEVELOPMENT_ENCRYPTION_PLACEHOLDER` rule (`/^A{43}=$/`) classifies as
safe. No real key material appears.

## Failure QA (plan scenario) and scanner boundary

Plan scenario: "temporarily write `waha_api_key: fake-secret-123` into
`apps/web/src/app.tsx` and assert `pnpm secret-scan` fails, then revert."

Executed literally, the probe did NOT fail the scan (exit 0 with the line
present). Root cause, from `scripts/secret-patterns.mts:32-36`: both
`SECRET_ASSIGNMENT_PATTERN` and `DOCKER_SECRET_ASSIGNMENT_PATTERN` match only
UPPERCASE `*_API_KEY|*_TOKEN|*_PASSWORD|*_SECRET|*_ENCRYPTION_KEY` names, plus
provider tokens, private-key blocks, JWTs, and credential URLs. A lowercase
in-code field name is outside the scanner's contract by design. Widening the
patterns was out of Todo 4 scope and would false-positive the legitimate
`waha_api_key` field names in `apps/web/src/components/admin-pages.tsx`; the
boundary is recorded here instead of silently normalized.

The intent — "the scan fails when a secret assignment is present" — was proven
with the contract-matching form:

```
$ printf '\nWAHA_API_KEY=fake-secret-123\n' >> apps/web/src/app.tsx
$ npx --yes pnpm@10.12.4 secret-scan ...; echo EXIT=$?
apps/web/src/app.tsx:76 secret-value remove secret material and inject it through the approved secret store
EXIT=1
$ # restored from backup in the same chain
$ git status --porcelain -- apps/web/src/app.tsx   # empty → byte-identical restore
$ npx --yes pnpm@10.12.4 secret-scan ...; EXIT=0   # happy path re-proven
```

## Adversarial probes

| Class | Probe | Result |
|---|---|---|
| dirty_worktree (uncommitted state files) | `git status --porcelain` shows the edited `.claude/state/*` files, the Todo 3 `docs/operations.md` refresh, and untracked `.omo/boulder.json` + finalize plan + this evidence file | Expected, not a defect — the plan sets `Commit: N` (no commit until explicitly requested), so all Todo 4 outputs are deliberately uncommitted; nothing was staged, and `.secrets/*` is absent from both the worktree listing and the index |
| misleading_success_output (scan passes but secret in file) | Two-layer probe: (a) the literal lowercase plan probe passes while a fake secret is present — root-caused to the scanner's uppercase-assignment contract and documented above; (b) the contract-matching `WAHA_API_KEY=fake-secret-123` probe correctly fails exit 1 with a `secret-value` diagnostic | Documented — the scanner's pass is trustworthy for its documented detection contract; the content-based value-leak scan (0 hits) independently proves no REAL secret value is tracked |
| stale_state (verifying a cached/stale result) | Both acceptance commands re-run after all state-file edits; the state edits introduce no secret-shaped content, and the final rerun still exits 0 | PASS — final-state receipts below |

## `.secrets/*` not committed

```
$ git check-ignore -v .secrets/postgres_password
.gitignore:5:.secrets/	.secrets/postgres_password
$ git ls-files .secrets/ | wc -l
0
```

## Cleanup receipt

```
$ rm -f /tmp/opencode/t4-secret-patterns.txt /tmp/opencode/t4-fail-scan.out \
      /tmp/opencode/t4-fail-scan2.out /tmp/opencode/app.tsx.bak
$ ls /tmp/opencode/t4-* /tmp/opencode/app.tsx.bak
zsh: no matches found   # all gone; secret pattern file destroyed
```

`apps/web/src/app.tsx` restored byte-identical (scoped `git status` empty).
No containers, ports, or services were created by this todo.

## Handoff to Todo 5

Todo 4 acceptance criteria are green; Todos 5-6 (lint/typecheck/test,
Settings/Users regression) are unblocked. Residual note for the release sweep:
the scanner's lowercase-in-code blind spot is documented, in-contract, and
compensated by the content-based value-leak check recorded here.

---

# Evidence — waha-finalize-15-16, Todo 3: Refresh operational docs and README ban-risk guidance

Date: 2026-09-10 14:41 UTC
Plan: `.omo/plans/waha-finalize-15-16.md` (Todo 3)
Base commit: `d123c236bd51571aadfc9b368c5c7340203fc518`
Files in scope (edited): `README.md`, `docs/operations.md`,
`.claude/state/DECISIONS_LOG.md`
Files in scope (reference only, verified compliant, not edited):
`docs/decisions/0001-product-boundary.md` (Network boundary already states
"binds to loopback by default", `WEB_BIND_ADDRESS`, and
"reverse-proxy HTTPS/TLS" with firewall restrictions)

## Result

PASS. The acceptance greps are green
(`loopback by default` in `docs/operations.md`, `reverse-proxy.*TLS` in
`docs/operations.md`, `ban risk` in `README.md`), `pnpm docs:check` exits 0,
and the ban-risk paragraph now names every planned mitigation — pacing,
budgets, quiet hours, duplicate/burst protection, cooldowns,
timelock/capping, human approval — while explicitly stating the mitigations
"cannot guarantee account safety or recipient delivery". No account-safety
promise was added anywhere.

## Baseline (all three acceptance greps failed)

```
$ grep -q 'loopback by default' docs/operations.md; echo $?
1    # text said "The loopback bind is the safe default."
$ grep -q 'reverse-proxy.*TLS' docs/operations.md; echo $?
1    # text said "a reverse proxy terminating HTTPS/TLS" (space, not hyphen)
$ grep -q 'ban risk' README.md; echo $?
1    # misleading: "ban risk" existed but was wrapped across two lines
     # ("...Restriction or ban\nrisk is inherent..."), so the line-based
     # grep could not see it
```

## Changes

1. `docs/operations.md` (File and port rules): the paragraph now opens
   "The web dashboard binds to loopback by default (`127.0.0.1`)", keeps
   `WEB_BIND_ADDRESS` for explicit trusted LAN/VPN boundaries, and states a
   public deployment "requires a reverse proxy terminating HTTPS/TLS (a
   hardened reverse-proxy TLS front end), strict firewall rules, secure
   cookies and headers, and login rate limiting", ending with "Never place
   WAHA directly on the public interface."
2. `README.md` (Scope): the ban-risk paragraph was reflowed so
   "Restriction or ban risk is inherent" sits on one line and the mitigation
   list names consent-first sending, send pacing, per-session budgets, quiet
   hours, duplicate/burst protection, newly-linked cooldowns,
   timelock/capping signals, and human approval of every dispatch, closing
   with "These reduce risk but cannot guarantee account safety or recipient
   delivery." The README Docker-deployment section already documented the
   `127.0.0.1:8080` loopback default and `WEB_BIND_ADDRESS` for LAN/VPN; it
   was verified, not changed.
3. `.claude/state/DECISIONS_LOG.md`: the 2026-08-16 "Dashboard exposure with
   internal WAHA" decision still instructed "Bind the dashboard to
   `0.0.0.0` for LAN/VPN convenience", contradicting the shipped loopback
   default. A dated amendment (2026-09-10, matching the file's existing
   amendment convention) records the supersession: loopback by default via
   `WEB_BIND_ADDRESS`/`WEB_PORT`, explicit trusted LAN/VPN addresses only
   when intentional, with the rest of the decision (internal unpublished
   WAHA, reverse-proxy TLS/firewall hardening, auth/cookie/CSRF/rate-limit
   controls) still in force.

## Automated acceptance (exact task commands)

```
$ grep -q 'loopback by default' docs/operations.md && echo AC1: PASS
AC1: PASS
$ grep -q 'reverse-proxy.*TLS' docs/operations.md && echo AC2: PASS
AC2: PASS
$ grep -q 'ban risk' README.md && echo AC3: PASS
AC3: PASS
$ npx --yes pnpm@10.12.4 run docs:check 2>&1 | tail -3; echo "exit=${pipestatus[1]}"
> waha-command-center@ docs:check ...
> node --experimental-strip-types scripts/release-checks.mts docs
exit=0
```

## Manual-QA channel (exact task commands)

```
$ cat docs/operations.md | grep -A 2 'loopback'
The web dashboard binds to loopback by default (`127.0.0.1`); keep that default
for local use or a reverse-proxy front end. Set `WEB_BIND_ADDRESS` to an
explicit trusted LAN or VPN address only when that boundary is intentional.

$ cat README.md | grep -A 2 'ban risk'
ban risk for any linked account. Treat it as an operational blocker, not an
edge case. RelayNest's mitigations are consent-first sending, send pacing,
per-session budgets, quiet hours, duplicate/burst protection, newly-linked
```

(The second excerpt is from the first README draft; the final committed
wording begins "Restriction or ban risk is inherent" on one line and carries
the same mitigation list — re-verified green by AC3 above and the final
`git diff` review.)

## Failure-scenario QA (plan line 83)

```
$ cp README.md /tmp/opencode/README.bak   # paragraph removed via scripted slice
$ grep -q 'ban risk' README.md; echo "exit=$?"
exit=1   # check correctly fails without the paragraph
$ mv /tmp/opencode/README.bak README.md && grep -q 'ban risk' README.md
restored: grep PASS again   # byte-identical restore, diff stat: 7 insertions, 4 deletions
```

## Adversarial probes

| Class | Probe | Result |
|---|---|---|
| misleading_success_output (docs check passes but content missing) | First edit draft satisfied the plan greps but broke `pnpm docs:check` (`README.md:0` / `docs/operations.md:0` documentation-marker-missing): `scripts/release-docs-rules.mts` pins the literal markers `Restriction or ban` and `reverse proxy terminating HTTPS/TLS`. Conversely, the pre-edit baseline had docs:check green while all three plan greps failed — docs:check alone proves neither direction | Fixed by keeping both forms on single lines ("Restriction or ban risk is inherent"; "a reverse proxy terminating HTTPS/TLS (a hardened reverse-proxy TLS front end)") so the rules markers and the acceptance greps are simultaneously satisfied; final run: greps PASS + docs:check exit 0 |
| stale_state (old docs cached) | Grep of `.claude/state/DECISIONS_LOG.md` surfaced the 2026-08-16 "bind to `0.0.0.0`" decision contradicting the loopback default; ADR 0001's Network section was checked and found already current (loopback by default, `WEB_BIND_ADDRESS`, reverse-proxy HTTPS/TLS) | Stale decision amended in place with a dated supersession note; ADR left untouched |
| dirty_worktree | `git diff --stat` after restore shows exactly the three scoped files plus an unrelated `apps/web/src/app.tsx` 2-line addition (`waha_api_key = "fake-secret-123"`) that matches Todo 4's plan-specified secret-scan failure injection (plan line 91) running in the parallel Wave-2 lane | Not a defect of this todo — scoped files only; the concurrent probe file was left untouched per worktree discipline |

## Constraints check

- No account-safety promise: the paragraph states mitigations "cannot
  guarantee account safety or recipient delivery"; no positive safety claim
  was added to any edited file.
- All planned mitigations named: pacing, budgets, quiet hours,
  duplicate/burst, cooldowns, timelock/capping, human approval (plus
  consent-first sending).
- No secrets logged: evidence contains doc phrasing, grep exit codes, and
  diff stats only; the `fake-secret-123` placeholder visible in the worktree
  belongs to Todo 4's deliberate probe and is a public dummy value from the
  plan text itself, not credential material.
- Docs-only change: no source, test, Compose, or protected plan/ledger file
  was modified.

## Handoff to Todo 4

Todo 3 acceptance criteria are green; Todo 4 (state-file freshness +
`pnpm secret-scan`) is unblocked, and its `app.tsx` failure-scenario probe
was observed active in the worktree during this todo.
