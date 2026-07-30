# Automated Production Verification & Audit History (Sprint 9.5)

Post-sync **immutable** verification snapshots. Read-only evaluation of marketplace data; never mutates business tables.

## Trigger

After every completed dashboard sync (success / partial / warning / failed), `sync-job-service` schedules:

`schedulePostSyncVerification(...)`

Failures in verification **never** fail the sync job.

Manual diagnostic: `POST /api/monitoring/verify`

## Storage

Table: `sync_verification_reports`  
Migration: `supabase/migrations/20260724190000_sync_verification_reports.sql`  
Apply: `npm run apply:sync-verification-reports-migration`

INSERT-only. Snapshots are never updated.

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/monitoring/verification-history?marketplaceAccountId=` | Chronological history |
| `GET /api/monitoring/verification-history/[id]?format=json\|csv\|pdf` | Detail + export |
| `POST /api/monitoring/verify` | Manual snapshot |

## UI

`/monitoring` — Production Health extended with:

- Latest Verification
- Verification History + health score trend
- Verification Details + failure analysis
- Export JSON / CSV / PDF

## Checks in each snapshot

- Schema compatibility
- Orders / Sales / Finance / Inventory: API latest, DB latest, gap, status
- Sync duration, inserted/updated, errors, final status
- Operational alerts + classified failures
- Overall PASS / WARNING / FAIL + health score
