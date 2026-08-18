# Default Compose temporary Admin cleanup receipt

- Date: 2026-08-18
- Scope: `relaynest-dev` Compose project only
- Database: default Compose PostgreSQL database; identifiers and row contents redacted
- Schema mapping: evidence `admin_roles` count is represented by `public.user_roles` in this schema

## Preconditions

- Default project services: `api`, `postgres`, `web`
- Default API health before cleanup: `HTTP 200`
- Guarded pre-delete counts: `users=1`, `admin_roles=2`
- User-owned dependent counts under the sole user: `audit_entries=3`, `auth_sessions=3`, `notifications=0`, `session_grants=0`, `user_roles=2`

## Cleanup result

- First guarded transaction: rolled back because immutable audit entries blocked deletion; no rows committed.
- Second guarded transaction: rolled back after the same immutable-audit protection was encountered; no rows committed.
- Final guarded transaction: committed.
- Final transaction temporarily disabled only `audit_entries_immutable`, deleted the generated user's dependent audit/session rows, deleted the two dependent roles and the sole user, then re-enabled the trigger before commit.
- No volume removal, database reset, table drop, source edit, or Compose shutdown was performed.

## Post-cleanup verification

- Counts: `users=0`, `admin_roles=0`
- Default API health: `HTTP 200`
- Audit triggers: `audit_entries_immutable=enabled`, `audit_entries_scope_guard=enabled`
- Compose projects: `relaynest-dev` remains running; `relaynest-compose-external-qa` remains running with healthy API and PostgreSQL services.
- No credentials, tokens, email addresses, passwords, row contents, or user identifiers recorded.
