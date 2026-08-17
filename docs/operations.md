# Operations Runbook

## Retention and purge

Retention categories are `messages`, `contacts`, `events`, `notifications`,
and `audit`. Policies are scoped independently to Personal or Business. A
policy update changes metadata only; it never starts deletion.

1. Authenticate as an Admin in the target account scope.
2. `POST /admin/retention/{scope}/preview` with `{ "category": "messages" }`,
   including the authenticated session, CSRF token, and matching `Origin`.
3. Review the returned `cutoff`, `count`, and bounded `batchSize`.
4. Cancel by taking no further action. Cancellation has no database effect.
5. Confirm with `POST /admin/retention/{scope}/purge`, repeating the category,
   cutoff, preview count, and server-issued `previewToken` with
   `confirmed: true`.

The server rejects missing confirmation, stale preview counts, malformed input,
cross-scope requests, non-Admin roles, foreign origins, and missing CSRF proof.
Each transaction selects at most 100 eligible parent records and deletes their
dependent dispatch rows in the same transaction. Repeating the operation is
safe and converges toward zero. The `audit` category is intentionally
non-destructive: content-free accountability rows are never purged.

## Encrypted backup and restore

The Admin-only endpoints are:

```text
POST /admin/backups/{scope}
POST /admin/backups/{scope}/restore
```

The backup contains scope-limited PostgreSQL rows, including encrypted records,
jobs, sessions, retention metadata, users/roles needed by the scope, and
content-free audit rows and session messaging safety settings. The format-2
payload metadata and rows are authenticated and encrypted with AES-256-GCM using
`ENCRYPTION_MASTER_KEY`; the response contains only the encrypted envelope and
non-secret key version/fingerprint metadata. It never returns the master key or
plaintext rows. Export is capped at 10,000 rows/8 MiB and restore uses 250-row
chunks after validating all relational scope references.

Restore fails closed on a missing/wrong/tampered key, malformed envelope,
unsupported table, invalid parent reference, or scope mismatch. Backup artifacts
outside PostgreSQL have their own expiry and
must be removed through their storage lifecycle; purging live data does not
claim immediate removal from expired external copies, snapshots, or archives.

## Key rotation

Key rotation is an offline maintenance operation, not a dashboard action.

1. Stop API/worker writes and confirm a tested backup exists.
2. Keep the old key available in the approved secret store; do not put either
   key in shell history, logs, HTTP payloads, or repository files.
3. Run a controlled envelope re-encryption migration for every encrypted DB
   field, using the old key to decrypt and the new key to encrypt. Abort on any
   authentication failure; never replace an unreadable value with plaintext.
4. Re-encrypt the backup artifact with the new key and verify restore into an
   isolated PostgreSQL database, including Personal/Business boundaries.
5. Switch `ENCRYPTION_MASTER_KEY`, restart the API/worker, and run the focused
   encryption, backup, and repository suites.
6. Retire the old key only after the restore and external backup-expiry checks
   pass. Record key version, fingerprint, operator, and timestamps without
   recording key material.

The current service deliberately has no casual UI key-rotation control. A
rotation without the controlled re-encryption migration is unsupported and must
fail closed rather than making existing encrypted records unreadable silently.
