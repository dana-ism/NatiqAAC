# V2 Supabase migration application — 2026-11-09

This operational update supersedes the earlier delivery report's deferred
Supabase-migration status. The owner explicitly requested application after the
initial code/PR delivery.

## Target and preflight

- Project: `myzmlxseewuqemnkqhgp`, session pooler on port 5432, PostgreSQL 17.11.
- TLS certificate and hostname verification were enabled using the existing local
  Supabase Root 2021 CA. Certificate verification was not disabled.
- Read-only inspection found only the original completed migration, with its
  checksum matching the repository. Prisma diff confirmed the original schema
  matched the target before application.
- Aggregate account state: one ACTIVE ADMIN and nine ACTIVE PARENT accounts;
  zero normalized-email collision groups. No individual account details were
  printed or included in this report.

## Backup and isolated rehearsal

A custom-format PostgreSQL 17.11 backup of the affected `public` schema, including
its data and Prisma migration history, was created outside the repository under
the owner's `.codex/backups/NatiqAAC/` directory. The new backup folder's ACL
permits the current user; no credentials or archive content were committed.

- Archive: `public-before-v2.dump`, 7,976 bytes.
- SHA-256: `78f10536fd420a9066e3beab1122b0d86460ce16b29b18db72a68f7c4542361e`.
- Archive magic and `pg_restore --list` inventory were validated successfully.
- This is a backup of the affected public schema, not the entire Supabase project
  or Storage. A full restore of real account data was not performed.
- Exact local location and hash are recorded in `backup-manifest.json` beside
  the archive. Keep these files private; they contain or reference account data.

A separate newly created database inside the inspected isolated PostgreSQL
container rehearsed V1 → V2 through Prisma Migrate using four synthetic accounts:
active Parent, suspended Parent, active Specialist and active Admin. Their original
fields were preserved, all four received the explicit legacy exemption, none was
marked email-verified, and a newly inserted synthetic account defaulted to
`legacy_auth_exempt=false`. No real backup data was restored into test databases.
The separate rehearsal database contains synthetic data only and was left in place;
no reset/drop/cleanup of existing databases was performed.

## Application and verification

Applied through `prisma migrate deploy --config prisma.config.ts` with an
explicit process-local target URL and strict TLS settings:

`20261109000100_auth_account_v2`

Post-application checks succeeded:

1. Prisma migration status reports the database up to date.
2. Prisma diff reports no difference between the target and current schema.
3. Both migration records are completed, not rolled back, and have matching
   repository checksums.
4. All ten accounts remain. A server-side aggregate fingerprint over the original
   IDs, names, emails, password hashes, roles, statuses and timestamps matched before
   and after application. No hashes or individual account values were printed.
5. All ten existing accounts have the approved legacy exemption; zero accounts
   were falsely marked email-verified. The default for future accounts is false.

No accounts were deleted, promoted, suspended or otherwise rewritten. No reset,
destructive rollback, manual migration-history edit or real email was performed.
Local `.env` files and `opencode.json` were preserved. The migration SQL itself
was not changed after application.

## Remaining operational work

The Supabase schema gate is now complete. Gmail sender authorization, Google and
Meta configuration, private document storage and their real smoke tests remain
separate pending gates. Application deployment/restart and actual account login
were not performed as part of this migration operation. Use the V2 backend/client
together; do not roll back to code that assumes every provider account has a
password. Recovery requires a separately reviewed restore or forward-fix plan.
