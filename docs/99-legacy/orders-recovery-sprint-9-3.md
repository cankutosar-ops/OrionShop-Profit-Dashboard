# Sprint 9.3 — Orders Recovery & Deployment Integrity

## Status

| Phase | Status |
|-------|--------|
| 1 Schema recovery | **Blocked** — no DDL credentials (`SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD`) |
| 2 Orders recovery | Ready (`scripts/recover-orders-gap-sprint-9-3.mjs`) — waits on Phase 1 |
| 3 Validation | Ready — same recovery script |
| 4 Deployment integrity | **Implemented** (read-only) |

## Migration to apply (manual or with DDL env)

File: `supabase/migrations/20260712200000_wb_orders_price_with_disc.sql`

```bash
# After setting SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD:
npx tsx scripts/apply-wb-orders-price-with-disc-migration.mjs

# Then recover Orders for the gap only:
npx tsx scripts/recover-orders-gap-sprint-9-3.mjs --account 1 --from 2026-07-13 --to 2026-07-24

# CI / deploy gate:
npm run validate:schema-compatibility
```

## Startup validation (Phase 4)

- `src/lib/schema-compatibility.ts` — required columns + message format
- `src/lib/schema-compatibility-check.ts` — read-only SELECT probes
- `src/instrumentation.ts` — logs on server start; **does not stop development**
- `scripts/validate-schema-compatibility.mjs` — exits 1 on mismatch (CI)

Checks:

- `wb_orders.price_with_disc`, `wb_orders.last_change_date` → migration `20260712200000`
- `wb_sales.price_with_disc`, `wb_sales.for_pay` → migration `20260712180000`

Never ALTERs, never auto-migrates, never repairs.
