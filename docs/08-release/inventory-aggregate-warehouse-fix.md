# Documented WB warehouse sentinel

Account 1 inventory diagnostic run [35511245233](https://github.com/cankutosar-ops/OrionShop-Profit-Dashboard/actions/runs/35511245233) at release `ea6da561bb7a0aca971e93e2dcfc0eb304fd3a73` failed before mapping or persistence. The stock endpoint returned HTTP 200 and 123 items. `flattenCompleteStock.integer` rejected numeric `warehouseId: -999999` at item 0 / warehouse 0 as `below_minimum` (minimum 1).

The [current official WB Analytics contract](https://dev.wildberries.cn/docs/openapi/analytics), inspected September 20, 2026, explicitly includes `warehouseId: -999999`, `warehouseName: "Склад WB"`, and `regionName: "Склад WB"` in the 200 response example for `/api/analytics/v1/stocks-report/wb-warehouses`. Classification: **A — validator too strict for a valid WB value**. This resolves the previously unknown field semantics in inventory-numeric-diagnostics.md.

Accept only that exact numeric sentinel in the complete-source validator and canonical mapper. Preserve the source warehouse name, ID and `id:-999999` canonical key; never allocate the aggregate to invented physical warehouses. All other ID, quantity, duplicate, completeness and atomic replacement checks remain in place. The existing BIGINT warehouse column supports this value: no migration or historical repair is needed. Financial Engine V4 is unchanged.

Sanitized fixtures retain the offending field/type and replace product identities with synthetic IDs. Regressions cover multiple variants, aggregate and ordinary warehouses coexisting, barcode/account isolation, repeat sync without duplicate identities, invalid negative values and failure retention. Local restored-DB rehearsal checks sentinel persistence, duplicate rollback, idempotent business state, account isolation and existing atomicity/ACL/concurrency contracts.

Before/after production fingerprints match for all 27 audited business tables and every historical inventory account/date. Historical rows remain 32,236; Account 1 target date 2026-09-20 remains empty. No rows were mapped, attempted or persisted by the failed diagnostic; existing snapshots were retained. Operational run/log metadata changed as expected.

The candidate requires a new SHA approval before another single Account 1 inventory-only run. Main stays on the approved diagnostic SHA. Scheduling remains disabled; no other task, hosting, canonical read cutover or beta invitation is authorized here.
