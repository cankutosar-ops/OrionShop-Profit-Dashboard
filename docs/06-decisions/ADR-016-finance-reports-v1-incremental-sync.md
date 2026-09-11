# ADR-016 — Finance Reports/V1 Incremental Sync

---

Status

Accepted

---

Owner

Platform Architecture

---

Audience

- Developers
- AI Assistants
- Product Owner

---

Module

Finance ingestion / Commercial Continuity

---

Category

sync

---

Dependencies

- [Decisions Index](./INDEX.md)
- [Account 2 Reports API Research](../02-architecture/ACCOUNT_2_REPORTS_API_FINAL_RESEARCH.md)
- [Historical Data Warehouse](../02-architecture/HISTORICAL_DATA_WAREHOUSE.md)
- [Commercial Data Continuity](../02-architecture/COMMERCIAL_DATA_CONTINUITY.md)

---

## Context

Account 2 historical Finance recovery completed via Wildberries Financial Reports / Sales Reports V1 detailed (`2026-06-22` → `2026-08-28`). The proven page contract is:

HTTP → parse → normalize/map → UPSERT `wb_finance` → verify persistence → **only then** advance `rrdId`.

Production still had a split: Account 2 recovery used Reports/V1; Account 1 / Finance Sync V2 still used Statistics V5 `reportDetailByPeriod` for detail, plus list discovery in the same wake. Recovery cursor lived in filesystem JSON and is not multi-instance safe.

The Dashboard already reads Finance from Supabase. The remaining problem is **ingestion**, not accounting formulas.

## Decision

1. **Canonical line source** is `POST /api/finance/v1/sales-reports/detailed` (`period=weekly`, `limit=100000`, `rrdId` cursor).
2. **Statistics V5 is deprecated** for new Finance line ingestion. Account 2 must never use V5. Account 1 may keep V5 only as controlled legacy until the same V1 kernel is proven for that token.
3. **Reports/V1 list is not a line source.** It may be used later for control totals / health, but a normal detailed wake must not call list (quota is 1 req/min).
4. **Shared kernel:** `fetchFinanceV1ReportPage` + existing mapper (`mapFinanceRowsFromReport` / `rrd:{rrdId}:{suffix}`) + `batchUpsertFinance` / `syncFinanceV1Page`. Do not create a second mapper or UPSERT stack.
5. **Cursor:** weekly period + persisted `rrdId`. Never `MAX(operation_date)` or wall-clock as an API cursor. Never a global bare `rrdId` without week bounds.
6. **Planner:** current incomplete UTC Monday–Sunday week is primary. Last two completed weeks are overlap revalidation (restart `rrdId=0`, idempotent UPSERT, isolated from the current-week cursor).
7. **One detailed HTTP request per wake.** No inline retry. HTTP 429 fail-closed; cursor unchanged.
8. **Rate-limit state is Reports-specific** (`reportsLastRequestAt`, `reportsNextRequestNotBefore`, `reportsServerRetryUntil`, `reportsLastRateLimitSnapshot`). Legacy V5 `serverRetryUntil` must not block Reports. Missing Reset/Retry on HTTP 200 still processes the body; local minimum gap is `FINANCE_RECOVERY_MIN_PAGE_GAP_MS` (70s). Do not invent `reportsServerRetryUntil`.
9. **204 / empty** marks the weekly period complete and clears the active cursor.
10. **Durable per-account state** lives in Supabase (`finance_incremental_sync_state`), not recovery JSON.
11. **Account isolation:** one account, one token, one lock, one cursor, one Reports cooldown. Account 2 seller identity is `68674`.
12. **No DELETE / TRUNCATE.** No Financial Engine or Dashboard formula changes.
13. **Live HTTP** requires `FINANCE_V1_LIVE_REQUESTS_ENABLED=true`. Default remains off.

## Consequences

### Positive

- Historical recovery and incremental sync share one ingestion kernel
- Crash-safe resume after the last persisted page
- Late-arriving week corrections via overlap UPSERT
- Commercial Continuity / Finance Sync V2 / manual finance paths can converge

### Negative / Constraints

- One page per hourly tick is slower than a multi-page loop; this is intentional
- V1 logistics mapping remains uncertain (`delivery_rub`)
- Account 1 V5 path remains until that account’s V1 token is proven

### Forbidden by this ADR

- Using Statistics V5 for Account 2 Finance
- Advancing `rrdId` before a successful UPSERT
- Calling list inside a detailed wake
- Inventing `reportsServerRetryUntil` when Reset/Retry are absent
- A second Finance mapper or persistence implementation
- Changing Estimated Tax / Financial Engine / Dashboard formulas
