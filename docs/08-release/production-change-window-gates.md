# Production change-window gates

This runbook describes the controlled path for deploying the reviewed OrionShop schema changes. It does not authorize a production change. A human change-window approval is required before any step that changes production.

## Gate 0: establish a frozen starting point

1. Establish whether an external web deployment exists; currently none is evidenced. Record local/manual writers and the proposed first host, Git SHA, scheduler owner, and required configuration. Do not record secret values.
2. Hold local dev servers (their inventory timer defaults on), manual sync, and finance-recovery commands after the change window begins. Hold any newly evidenced external writer. No Vercel scheduler hold is required.
3. Run the read-only writer check. There must be no active finance lease, unfinished sync run, unfinished commercial tick, or nonterminal commercial entity.
4. Re-run the catalog and RLS precheck. Confirm the three reviewed broad read policies and their tenant/service counterparts have the expected pre-containment definitions.
5. If production data has changed since the most recently verified recovery point, create a fresh logical `public` schema/data backup set, verify its checksums, and restore it into a new isolated local database according to [the local recovery procedure](local-logical-backup-recovery.md).
6. Freeze the migration file hashes. Stop if a reviewed hash differs.

## Gate 1: policy containment

Only after Gate 0 passes, perform the separately approved migration-ledger metadata reconciliation. Never run a blind migration push and never mark unproven historical migrations as applied.

Apply `20260917110000_contain_residual_tenant_read_policies.sql` by itself. Immediately verify:

- the named broad authenticated/anonymous `USING (true)` policies are absent;
- tenant-scoped policies and service-role access remain;
- anonymous reads are blocked;
- own-tenant and foreign-tenant authenticated probes have the expected results;
- no product, finance, sales, or stock rows changed.

Stop on any policy, grant, catalog, or probe mismatch.

## Gate 2: atomic finance lease

Apply `20260917120000_finance_incremental_atomic_lease.sql` by itself. Verify lease acquisition, renewal, fencing, account isolation, and the finance source-key unique contract using read-only checks and the reviewed verifier. Do not run a live finance catch-up as part of this migration gate.

## Gate 3: durable current prices

Apply `20260917130000_wb_current_prices.sql` by itself. Verify account-scoped current-price identity, service access, tenant policy, and idempotent write semantics. No pricing UI cutover or Product Cost reinterpretation occurs in this gate.

## Gate 4: canonical current stock

Apply `20260917140000_wb_canonical_current_stocks.sql` by itself. Verify the canonical identity preserves the supplied account, product, warehouse, variant, and barcode dimensions. Keep `ORION_CURRENT_STOCK_SOURCE=legacy` until a complete per-account canonical pull and reconciliation succeeds. Do not alter historical inventory snapshots.

## First scheduler activation after all gates

GitHub Actions is the intended first production scheduler, hourly at minute 20 (`20 * * * *`). No Vercel deployment or cron is evidenced and no handover is required. Keep `vercel.json` dormant. Before merging the workflow onto the default branch, hold automatic scheduling so it cannot run before the bounded manual acceptance tick. Under explicit approval, verify that tick and data freshness, then enable the scheduled owner. Keep local development timers and web-host inventory timers off during this transition. Advertising cadence is a separate decision.

## Stop and rollback conditions

Stop immediately on an unexpected catalog change, RLS mismatch, active writer, failed migration, failed post-migration verifier, changed Financial Engine result, or canonical-stock reconciliation failure. Keep reads on legacy stock, retain the pre-window logical backup, and use the verified local recovery procedure for any restore decision. Do not use destructive down migrations in production.
