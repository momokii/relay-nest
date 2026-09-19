# Versioning policy and release workflow — RelayNest v1.0.0

> Normative references: [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) and [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). This document is the source of truth for every future bump from `1.0.0`.

## 1. Overview

RelayNest follows **SemVer 2.0.0** (`MAJOR.MINOR.PATCH`) starting at `1.0.0` (2026-09-20).
A version identifies one coherent, deployable product — not a package — and is published
as a Git tag `vX.Y.Z`, a GitHub Release, Docker OCI labels, and a runtime `/version` response
derived from the same source. There is **no npm publish** and **no per-package versioning**.

## 2. Single source of truth

| Concern | Value |
|---|---|
| Canonical version | `version` field in the **root** `package.json` (`1.0.0` at time of writing) |
| No duplication | Do **not** create a `VERSION` file. Do **not** version `apps/*` or `packages/*` independently. |
| Runtime read | `apps/api/src/version.ts` reads `APP_VERSION` → falls back to `package.json#version` (`fallbackVersion`). |
| Build-time inject | `docker-compose.yml` → `Dockerfile.api`/`Dockerfile.web`/`Dockerfile.waha` build args `VERSION`, `GIT_SHA`, `BUILD_DATE` → `ENV APP_VERSION=$VERSION` etc. |

Changing the version means editing **one line**: root `package.json: version`.
Every other surface is derived. CI / local builds may override via env `VERSION`/`GIT_SHA`/`BUILD_DATE`
for reproducible images without editing source.

## 3. Changelog workflow (Keep a Changelog)

- File: [`CHANGELOG.md`](../CHANGELOG.md) — format per [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
- Header must state the Keep a Changelog and SemVer links (already present).
- Every version section is `## [X.Y.Z] - YYYY-MM-DD` with `### Added/Changed/Fixed/Security` subsections as needed.
- Comparison links at the bottom: `[X.Y.Z]` → `…/releases/tag/vX.Y.Z`, `[Unreleased]` → `compare/v<latest>...HEAD`.
- Workflow per bump:
  1. Work accumulates under `## [Unreleased]` as PRs merge (add entries eagerly; never leave a user-visible change undocumented).
  2. On release day: rename `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD`, move its content there, re-create an empty `## [Unreleased]` above it, and refresh the two bottom link definitions.
  3. The changelog change is committed together with the `package.json` bump (see §7).

## 4. Conventional Commits → SemVer mapping

Commits must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) (`type(scope): subject`). The `type` and the `BREAKING CHANGE` signal decide the bump:

| Commit signal | Bump |
|---|---|
| `fix:` (any scope), `fix(scope)!` **without** breaking note, `perf:`, `chore:`, `docs:`, `refactor:` | **PATCH** `1.0.0 → 1.0.1` |
| `feat:` / `feat(scope):` | **MINOR** `1.0.0 → 1.1.0` (backwards-compatible feature) |
| `feat!:` / `fix!:` / any `type!:` **or** footer `BREAKING CHANGE:` | **MAJOR** `1.0.0 → 2.0.0` |
| `build`/`ci`/`test` alone | No version bump unless accompanied by a user-visible `fix`/`feat` |

Rules:

- `BREAKING CHANGE:` in the footer **always** wins over the type — it forces MAJOR even if `type` is `fix`.
- The `!` shorthand (`feat!:`) is exactly equivalent to a `BREAKING CHANGE:` footer.
- Scope (`auth`, `api`, `web`, `waha`, `retention`, `backup`, `campaign`, etc.) is descriptive; only `type`/`!`/`BREAKING CHANGE` drives the bump.
- One PR should not mix a breaking commit with an unrelated `feat`/`fix`; split if needed so the changelog stays categorizable.

## 5. Docker / OCI labels

All runtime images (`api`, `web`, `waha`) share the same labels, built from the build args:

```dockerfile
ARG VERSION=1.0.0
ARG GIT_SHA=dev
ARG BUILD_DATE
ENV APP_VERSION=$VERSION GIT_SHA=$GIT_SHA BUILD_DATE=$BUILD_DATE
LABEL org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$GIT_SHA \
      org.opencontainers.image.created=$BUILD_DATE \
      org.opencontainers.image.title="RelayNest" \
      org.opencontainers.image.source="https://github.com/momokii/relay-nest"
```

- `org.opencontainers.image.version` — SemVer string from `package.json` (or `VERSION` override).
- `org.opencontainers.image.revision` — full commit SHA (`GIT_SHA` / `APP_COMMIT` fallback).
- `org.opencontainers.image.created` — ISO-8601 UTC build timestamp (`BUILD_DATE` / `BUILD_TIME`).
- Title/source are constant.

Verify: `docker inspect <image> --format '{{json .Config.Labels}}' | jq`.

## 6. API `/version` contract

Defined in `apps/api/src/version.ts` and wired in `apps/api/src/app.ts`:

- `GET /version` → `{ version: string, commit: string, buildTime: string }` (`VersionInfo`).
  - `version` = `APP_VERSION` env or `package.json` fallback.
  - `commit` = `GIT_SHA` / `APP_COMMIT` / `"dev"`.
  - `buildTime` = `BUILD_TIME` / `BUILD_DATE` / `new Date().toISOString()`.
- `GET /health` → `{ status: "ok", version: string }` (same `version` source).
- Both responses are unauthenticated and content-free (no secrets). Contract tests should assert shape, not exact values.

## 7. Tag & GitHub Release steps

No npm publish. One release = one tag + one GitHub Release + one changelog rollover.

```bash
# 0. Be on main, clean and green
git checkout main && git pull --ff-only origin main
npx --yes pnpm@10.12.4 release   # lint, typecheck, test, e2e, audit, docs:check

# 1. Bump single source + changelog (example: 1.0.0 → 1.0.1)
#    - edit package.json: "version": "1.0.1"
#    - edit CHANGELOG.md: Unreleased → [1.0.1] - YYYY-MM-DD, recreate empty [Unreleased], refresh bottom links
#    Keep the two edits in ONE commit:
git add package.json CHANGELOG.md
git commit -m "chore(release): 1.0.1"

# 2. Tag (annotated, SemVer with v prefix)
git tag -a v1.0.1 -m "v1.0.1"

# 3. Push commit + tag
git push origin main
git push origin v1.0.1

# 4. GitHub Release (notes = that CHANGELOG section, verbatim)
gh release create v1.0.1 --title "v1.0.1" --notes-file - <<'NOTES'
## [1.0.1] - YYYY-MM-DD
### Fixed
- ...
NOTES

# 5. (Optional) Build images with explicit metadata
VERSION=1.0.1 GIT_SHA=$(git rev-parse HEAD) BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  docker compose build api web
```

- Tag **must** be `vX.Y.Z` (lowercase `v`, no `v` inside OCI `version` label).
- Never retag or force-push a published tag; if wrong, bump forward.
- Draft the GitHub Release notes by copying the new `## [X.Y.Z]` block from the changelog — don't rephrase.

## 8. Branch & tag protection guidance

Recommended GitHub settings (Settings → Branches / Tags):

- **Branch `main`**: Require pull request before merging, require status checks (`typecheck`, `test`, `lint`, `docs:check`), dismiss stale approvals, require linear history (no merge commits), do not allow force pushes or deletion. Optionally require signed commits.
- **Tag protection** (`v*.*.*`): Restrict tag creation to maintainers / release role; block deletion of `v*` tags.
- **Ruleset** alternative: one ruleset targeting `main` + `v*` with the same restrictions, enforced on the whole org.

If the repository is still private / low-ceremony, at minimum enable "Require pull request" + "Require status checks" on `main` before `v1.1.0`.

## 9. Bump examples

### PATCH — `1.0.0 → 1.0.1` (backwards-compatible bug fix)

- Commits: `fix(schedule): deduplicate idempotency edge on retry`, `fix(auth): preserve unavailable WAHA errors`
- Bump: `package.json` `1.0.0` → `1.0.1`; changelog `## [1.0.1]` collects the `Fixed` items; tag `v1.0.1`. No migration notes.

### MINOR — `1.0.0 → 1.1.0` (backwards-compatible feature)

- Commits: `feat(analytics): scoped delivery-projection endpoint`, `feat(web): retention preview filter`
- Bump: `1.0.0` → `1.1.0`; changelog `Added`/`Changed` entries; tag `v1.1.0`. Existing API contracts stay compatible.

### MAJOR — `1.0.0 → 2.0.0` (breaking change)

- Commits: `feat(api)!: remove /scoped/legacy endpoint` with footer `BREAKING CHANGE: /scoped/legacy removed; use /scoped/history` — or `fix(auth)!:` that changes a public contract.
- Bump: `1.0.0` → `2.0.0`; changelog `Changed` with migration notes under the same section (what broke, how to migrate); tag `v2.0.0`. Any persisted data migration must be documented here and in `docs/operations.md`.

## 10. Hotfix flow

For a critical production fix off the latest tag while `main` has diverged:

```bash
git fetch origin
git checkout -b hotfix/v1.0.1 v1.0.0
# apply minimal fix, add changelog entry under a new ## [1.0.1] section
git commit -m "fix(api): correct lease claim race on bounded retry"
# bump + changelog rollover as in §7, but base is the hotfix branch
# edit package.json 1.0.0 → 1.0.1, finalize changelog
git commit -m "chore(release): 1.0.1"
git tag -a v1.0.1 -m "v1.0.1"
git push origin hotfix/v1.0.1 v1.0.1
gh release create v1.0.1 --title "v1.0.1" --notes-file - < changelog-1.0.1-notes.md
# forward-merge the fix back to main
git checkout main && git merge --no-ff hotfix/v1.0.1
# on main, keep Unreleased holding the merged fix note; do not duplicate the tag
```

- Keep the hotfix branch minimal (one bug, no features).
- The SemVer bump is still PATCH on the `1.0.x` line; the next `main` feature still goes to `1.1.0` or `2.0.0` as usual.
- If `main` already moved to `1.1.0`, the hotfix becomes `1.0.1` and main later merges it without version regression.

## 11. Release checklist (copy-paste)

```text
[ ] git status clean, on main, pulled
[ ] pnpm release green (lint, typecheck, test, e2e, audit, docs:check)
[ ] package.json version bumped (single source)
[ ] CHANGELOG.md: Unreleased → [X.Y.Z] - YYYY-MM-DD, new empty [Unreleased], bottom links refreshed
[ ] Conventional Commits since last tag reviewed; bump matches feat/fix/! mapping
[ ] git commit -m "chore(release): X.Y.Z" (package.json + CHANGELOG.md together)
[ ] git tag -a vX.Y.Z -m "vX.Y.Z"
[ ] git push origin main && git push origin vX.Y.Z
[ ] gh release create vX.Y.Z --title vX.Y.Z --notes "<copy of ## [X.Y.Z] block>"
[ ] docker build inspected: labels version/revision/created correct; /version and /health return expected version
```

## 12. Contributing note

Contributors must use Conventional Commits (see §4) and update `CHANGELOG.md` `## [Unreleased]` for every user-visible change (Added/Changed/Fixed/Security). PRs without a changelog entry need an explicit `No changelog` justification for maintainers. See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full workflow.

---

*This policy is effective 2026-09-20 and applies to every change after `v1.0.0`. For questions, open a discussion referencing this file.*
