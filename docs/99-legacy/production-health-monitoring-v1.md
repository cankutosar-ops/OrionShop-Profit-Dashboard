# Production Health Monitoring (Sprint 9.4)

Operational diagnostics for marketplace sync health. **Read-only.** Does not change Financial Engine, reporting, or sync behavior. Does not auto-repair.

## Surface

- Page: `/monitoring`
- API: `GET /api/monitoring/production-health?marketplaceAccountId=…`

## Sections

1. **Production Health Score** — 0–100 with Healthy / Needs Attention / Critical  
2. **Data Freshness** — Orders, Sales, Finance, Inventory latest DB dates + days behind  
3. **API vs Database Coverage** — DB latest vs expected freshness target (calendar date) + gap + behind flag  
4. **Latest Sync** — last job / entity results when available (inserted, updated, errors)  
5. **Schema Validation** — PASS/FAIL from schema compatibility probe  
6. **Operational Alerts** — informational only (no automatic repair)

## Score inputs

- Schema FAIL (−40)
- Freshness warning/critical per entity
- Sync failed / partial
- Alert severity counts

## Related

- Sync verification: `/api/sync/verification`
- Schema CI: `npm run validate:schema-compatibility`
