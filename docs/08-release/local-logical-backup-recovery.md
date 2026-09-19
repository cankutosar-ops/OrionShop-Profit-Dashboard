# Local logical backup recovery

Use this procedure to prove a PostgreSQL logical backup can be recovered without changing a production database. It is intended for a local PostgreSQL 17 or local Supabase database only.

## Scope and storage

Create backups under `.local-backups/`. The directory is Git-ignored and must remain local: do not add, commit, push, or upload the dump, manifest, restore logs, or source-count snapshots.

For a Supabase application recovery check, export the `public` schema in two plain-SQL files:

1. a schema dump, containing tables, sequences, functions, constraints, indexes, RLS enablement, policies, and public grants;
2. a data-only dump using `COPY`, containing application table data and sequence values.

This scope intentionally excludes Supabase-managed schemas and platform secrets (`auth`, `storage`, `realtime`, `extensions`, `vault`, and platform roles). Do not blindly restore those objects into another hosted Supabase project. Check whether a migration ledger relation exists before asserting it is included.

## Create the backup

Use PostgreSQL client tooling compatible with the source major version. Record the UTC timestamp and create a count-only source snapshot before exporting. With the Supabase CLI, the equivalent commands are:

```powershell
supabase db dump --linked --schema public --file .local-backups\<name>-public-schema.sql
supabase db dump --linked --data-only --schema public --use-copy --file .local-backups\<name>-public-data.sql
Get-FileHash -Algorithm SHA256 .local-backups\<name>-public-schema.sql
Get-FileHash -Algorithm SHA256 .local-backups\<name>-public-data.sql
```

The manifest must contain only non-secret metadata: timestamp, server and tool version, scope, filenames, file sizes, SHA-256 values, and count-only source validation results.

## Restore locally

First prove the target is a new local database. Never use a production connection string or a linked production command for restore.

```powershell
createdb -U postgres orionshop_restore_verify
psql -X -v ON_ERROR_STOP=1 -U postgres -d orionshop_restore_verify -f .local-backups\<name>-public-schema.sql
psql -X -v ON_ERROR_STOP=1 -U postgres -d orionshop_restore_verify -f .local-backups\<name>-public-data.sql
```

When using Docker, run the same commands through the local Postgres container, copying the two files into that container first. Keep schema and data restoration separate and retain both logs. A data-only dump can warn about circular foreign keys; treat it as recoverable only if the restore completes with `ON_ERROR_STOP=1` and the integrity checks below pass. Do not suppress an application-object, security-object, or data restore error by dropping objects.

## Verify recovery

Compare the local database to the source count-only snapshot. At minimum, verify row counts for companies, marketplace accounts, products, product variants, WB orders/sales/finance/ads/stock, product-cost history, finance incremental state, and historical inventory snapshots.

Also verify the public catalog: relations, columns, constraints, indexes, functions, triggers, grants, RLS-enabled tables, and policies. Check that every foreign key is validated; that marketplace-account tenant relations have no orphans; that `(marketplace_account_id, sale_id)` has no duplicate rows; and that finance `source_key` is neither empty nor duplicated within an account. Confirm the reporting read tables exist.

A successful recovery has: clean schema and data restore logs, matching source counts, matching application catalog/security objects, zero integrity violations, and successful offline application/reporting verifiers. Record any deliberate exclusions as platform differences.
