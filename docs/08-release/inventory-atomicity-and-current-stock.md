# Inventory replacement and canonical stock release contract

The daily snapshot previously deleted an account/day in one request and inserted replacement rows in later requests. An insert failure could erase that day. Empty and malformed Analytics responses could also be mistaken for complete replacements.

`replace_inventory_snapshot_day` now validates a nonempty complete payload and matching account/date, takes a PostgreSQL transaction advisory lock for that account/day, deletes and inserts in one transaction, verifies the inserted count and returns it. A constraint, trigger, lock or insert failure rolls back the deletion. Snapshot grain stays `(marketplace_account_id, snapshot_date, warehouse_name, nm_id, size, seller_article, barcode)`; no historical identity is reinterpreted. Service-only execution is explicitly granted; tenant read policies remain unchanged. Retention remains a separate, explicitly authorized operation.

The seventh migration, `20260920091512_inventory_atomic_replacement.sql`, adds this function and `replace_wb_current_stocks_verified`. It does not change existing rows. The canonical wrapper invokes the previously rehearsed account-atomic replacement and verifies persisted identities and count inside the same transaction and account lock. Both functions reject empty input, including a nominally authoritative empty result: no existing business contract proves that empty means permission to erase data. Keep prior data and report unavailable until an explicit future contract exists.

## One canonical producer

`syncCanonicalCurrentStock` in `src/lib/marketplace-adapters/wildberries/current-stock-sync.ts` is invoked only by the independent `current-stock` worker task. The generic warehouse upsert continues writing legacy stock and no longer writes canonical stock. Commercial sync handles Orders/Sales/Finance; it is not a stock producer.

The producer uses the existing `WbApiClient.fetchWbWarehousesStock()` and POST `/api/analytics/v1/stocks-report/wb-warehouses`. WB documents one row per size and warehouse, offset pagination, updates every 30 minutes and one request per 20 seconds per account. See [WB Analytics documentation](https://dev.wildberries.ru/en/openapi/analytics) and [the endpoint release note](https://dev.wildberries.ru/en/news/302).

The client requests unfiltered pages of 100,000 rows until a short/empty terminal page. A malformed page, request failure or pagination safety ceiling throws instead of returning a prefix. The mapper rejects missing IDs/quantities, negative or noninteger quantities, missing warehouse identity, empty nested warehouse lists and repeated source identities. Offset APIs do not provide an immutable snapshot token; this implementation enforces the documented completion protocol, not point-in-time isolation at WB. Unexplained acceptance deltas remain a STOP.

Canonical identity remains `(account, nmId, chrtId, warehouse key)`. Barcode and size are enriched only from the account's persisted catalog, with deterministic pagination; ambiguous enrichment remains null. No content/card HTTP call is made by this producer. There is no legacy or historical write in this path. Errors propagate as an explicit worker failure; there is no in-memory success fallback.

The task requires exactly one account, inherits a deadline, stops on 429 without retrying, spaces Analytics pages by 20 seconds and checks cancellation before persistence. PostgreSQL lock waits are limited to five seconds. An HTTP response lost after commit is an uncertain outcome requiring a DB read before retry; atomicity does not imply a network client can undo a committed transaction. Re-sync is idempotent for business rows; generated snapshot IDs/timestamps may change.

`ORION_CURRENT_STOCK_SOURCE=legacy`, `INVENTORY_SNAPSHOT_SCHEDULER=0` and `SYNC_WORKER_SCHEDULE_ENABLED=false` remain the initial contract. The first acceptance sequence is commercial A1, commercial A2, inventory A1, inventory A2, current-stock A1, current-stock A2, verifying between every dispatch; Ads is separate. No auto-repeat or recurring activation.

## Local verification

`scripts/verify-stock-atomic-local.mjs` targets only the named local Docker restored database and uses reserved synthetic accounts. It verifies successful exact replacement, malformed/empty/cross-scope retention, forced post-delete insert failure rollback, two successful writers, a waiting second writer that fails after the first commits, retry idempotence, account/date isolation, service-only ACLs, canonical failure rollback, and unchanged history/legacy stock. It removes its own fixtures afterward.

`scripts/verify-stock-producer-offline.mjs` forbids network access and injects API/catalog/database dependencies to test source failure, malformed and interrupted pagination, empty rejection, catalog account isolation and independent task outcomes. `verify-canonical-current-stock-offline.mjs` verifies sizes, warehouses, barcode enrichment, restart/idempotence, legacy read defaults and absence of canonical writes from generic sync. Existing retention, DB-only historical, tenant, finance and report checks remain required.

No production migration, ledger repair, worker dispatch, WB request, hosting deployment or financial rewrite is part of this remediation.

## Original seven gates within the revised eight-migration package

All seven below retain local rehearsal coverage. The later comment-only correction is the eighth forward file and executes BEFORE these gates and historical ledger reconciliation; see [the revised baseline contract](historical-comment-correction.md). None was applied to production by this task. Each is a schema/security change without a business-data rewrite; retain the last validated schema and hold writers if validation fails. RLS containment is not rolled back by restoring broad access.

1. `20260917110000_contain_residual_tenant_read_policies.sql` — remove residual broad tenant reads; required security boundary; first, existing scoped policy prerequisites; medium access risk; safe hold with contained reads.
2. `20260917120000_finance_incremental_atomic_lease.sql` — durable atomic lease/fencing RPCs; required before worker activation; existing incremental tables prerequisite; medium concurrency risk; additive safe hold with worker off.
3. `20260917130000_wb_current_prices.sql` — durable account-scoped current prices; existing account schema prerequisite; low risk; additive safe hold without seeding or Product Cost substitution.
4. `20260917140000_wb_canonical_current_stocks.sql` — canonical table, variant linkage and account replacement RPC; existing account/catalog schema prerequisite; medium stock-grain risk; additive hold with legacy reads.
5. `20260920061522_contain_public_account_metadata.sql` — scoped account metadata surface; required before hosted tenant access; existing account-scope helper prerequisite; medium access risk; hold host unpublished on denial regression.
6. `20260920063101_finance_rls_statement_scope.sql` — equivalent statement-scoped allowed-account lookup; required for verified report performance; guarded existing policy prerequisite; low-to-medium read risk; no accounting change.
7. `20260920091512_inventory_atomic_replacement.sql` — atomic historical-day replacement plus strict canonical wrapper; requires historical snapshot/transit schema and migration 4; medium write-path risk at later worker activation, no data touched on apply; hold inventory/current-stock tasks if RPC validation fails.

Inventory remediation increased the original count from six to seven. The subsequent historical comment-proof correction increases the current package to eight. No previous migration is edited or replayed. Exact hashes, the unchanged conditional historical metadata repair set and production STOP checkpoints are in the execution package. Migration 7 SHA256 (Git/LF bytes): `DF10AFF0955152CD59D0D11D204726918832511F70ED7E784A5563CC912F6A05`.
