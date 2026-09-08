# Commercial Data Continuity

Status: Production

Owner: Platform Operations

---

## Purpose

Durable unattended synchronization for **Orders / Sales / Finance** that does
**not** depend on dashboard visits, browser sessions, or process-local timers.

Inventory Snapshot Continuity (Sprint 10.7) and Stock remain separate.

---

## Architecture

```text
External Durable Scheduler (Vercel Cron / external cron)
        ↓
GET|POST /api/sync/commercial-continuity
        ↓
runCommercialContinuityTick()
        ↓
DB: commercial_sync_ticks + commercial_entity_sync_state
        ↓
Existing sync: runBlockingDashboardSync → WbSyncService / Finance Sync V2
        ↓
Actual data coverage (latest_data_date)
        ↓
Freshness evaluation + durable retry
```

---

## Scheduler configuration

### Vercel Cron (preferred when deployed on Vercel)

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/sync/commercial-continuity",
      "schedule": "0 * * * *"
    }
  ]
}
```

Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when
`CRON_SECRET` is configured in the project environment.

### External cron (any host)

```bash
curl -X GET "https://<host>/api/sync/commercial-continuity" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET"
```

Blocking (ops / verification):

```bash
curl -X POST "https://<host>/api/sync/commercial-continuity" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"blocking":true,"force":true}'
```

### Required env

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Vercel Cron bearer |
| `INTERNAL_API_SECRET` | Internal/ops bearer (same as existing containment) |
| `ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE` | Production-wide Account 2 Finance quota reservation while historical recovery is active. Set `true` in **Vercel → Project → Settings → Environment Variables** for Production (and Preview if cron/API run there), and in operator `.env.local`. Local `account-2-recovery-progress.json` is not visible to deployed cron/API. Unset/invalid values fail closed for Account 2 Finance. Account 1 is never gated. Remove only after the campaign completes or is aborted. |

Interval is **configurable** via Platform Settings:

- `systemPreferences.commercialSyncIntervalMinutes` (default **60**)
- `systemPreferences.commercialSyncMaxLookbackDays` (default **14**)
- Feature flag `commercial_data_continuity` (default **enabled**)

---

## Execution vs data coverage

| Concept | Field | Meaning |
|---------|-------|---------|
| Execution time | `last_execution_at` | When a sync attempt finished |
| Successful execution | `last_successful_execution_at` | Last healthy / external_delay outcome |
| Data coverage | `latest_data_date` | Max `order_date` / `sale_date` / `operation_date` in DB |

`marketplace_accounts.last_sync_at` is **not** proof of freshness.
`last_successful_sync_at` advances only on full account `success` (not partial).

---

## Status model

Per entity: `success`, `partial`, `failed`, `rate_limited`, `permission_denied`,
`external_unavailable`, `external_delay`, `blocked`, `warning`.

Finance with **zero new rows** and no API error → `external_delay`
(Wildberries publishing lag), not a sync failure.

---

## Retry

- HTTP 429 → `rate_limited`, durable `next_retry_at` with bounded exponential backoff
- HTTP 403 → `permission_denied`, no indefinite retry
- HTTP 404 → `external_unavailable`
- Account isolation: one account failure never stops others
- Entity isolation: Finance failure does not rewrite Orders success

---

## Manual Sync coexistence

Manual Sync (`POST /api/sync`) and DashboardOperationalSync continue to use
`sync-job-service` locks. Scheduled ticks skip accounts already `running`.

---

## Migration

```bash
npm run apply:commercial-continuity-migration
```

Applies `supabase/migrations/20260812130000_commercial_data_continuity.sql`.

---

## Verification

```bash
npm run verify:commercial-continuity
```
