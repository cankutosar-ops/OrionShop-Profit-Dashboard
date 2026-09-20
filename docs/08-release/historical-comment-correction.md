# Historical comment correction and reconciled baseline

Preparation only. The previously approved release remains held at Gate 0B. A new release SHA and the changed execution order require Human Gate 2 re-approval. No production SQL, ledger repair, secret/config change, merge, worker run, backup, hosting or Auth change is authorized by this preparation.

## Exact correction

`20260920095101_restore_historical_column_comments.sql` contains BEGIN, exactly five COMMENT ON COLUMN statements, and COMMIT. Text is copied verbatim from the original migrations:

- `20260624120000_wb_finance_srid.sql`, `public.wb_finance.srid`: `Wildberries shipment/order id from reportDetailByPeriod; used for purchase-SRID logistics attribution.`
- `20260712180000_wb_sales_price_with_disc.sql`, `public.wb_sales.price_with_disc`: `Wildberries Sales API priceWithDisc — commercial list price after seller discount.`
- Same source, `public.wb_sales.for_pay`: `Wildberries Sales API forPay — goods settlement per sale/return (netForPay building block).`
- `20260726160000_historical_inventory_snapshot_transit.sql`, `public.historical_inventory_snapshots.in_way_to_client`: `Units in way to client (WB Analytics inWayToClient).`
- Same source, `public.historical_inventory_snapshots.in_way_from_client`: `Units in way from client (WB Analytics inWayFromClient).`

SHA256 (Git/LF bytes): `8D255F5210E04C2A197375FBCD9B57F0E3D6DBCB94980877CD377698DBC7DE35`. The previous seven migrations are unchanged. The new file has no column alteration, index, constraint, policy, grant, function, business-row or accounting statement. A missing column fails the transaction. Preflight must reject any unexpected nonempty comment rather than overwrite it. Reapplying identical comments is idempotent, but a lost response requires read-only reconciliation before retry.

## Rehearsal and equivalence

The correction was applied only to an isolated clone of the fresh, restore-verified local database. All five target comments were NULL before apply. Afterward, exact text matched all five original statements; all public-table counts and sorted row-content fingerprints were identical; the full public schema dump excluding comments was identical, covering types, defaults, nullability, indexes, constraints, RLS, grants, functions and triggers. Only the five intended column comments changed. A second local apply was idempotent. No Financial Engine V4 source changed.

`scripts/verify-historical-comment-correction-local.mjs` checks these properties and the enduring contracts of all seven historical candidates. It is pinned to a dedicated local Docker database and contains no production connection or credentials. Its before-absence assertion requires a fresh local clone for another full run; do not erase comments to manufacture a precondition in production.

After correction:

- `20260624120000`: nullable TEXT srid, exact non-null partial srid index, exact comment — **CURRENT-STATE EQUIVALENT AFTER FORWARD CORRECTION**.
- `20260712180000`: both NUMERIC(12,2) NOT NULL DEFAULT 0 columns and both exact comments — **CURRENT-STATE EQUIVALENT AFTER FORWARD CORRECTION**.
- `20260726160000`: both INTEGER NOT NULL DEFAULT 0 transit columns and both exact comments — **CURRENT-STATE EQUIVALENT AFTER FORWARD CORRECTION**.

This proves current schema postconditions, not that any historical file executed. The other four candidates also require current proof of their columns, comments and exact index definitions; none gains historical execution provenance from this correction.

## Ledger semantics

Supabase documents `migration repair --status applied` as inserting a migration-history record, and `--status reverted` as removing one. The command changes tracking metadata; it is not SQL replay or independent proof of execution. See [official CLI repair documentation](https://supabase.com/docs/reference/cli/supabase-migration-repair).

The proposed treatment is an explicitly approved **reconciled current-state baseline**. After independent equivalence checks pass, insert one tracking entry per approved historical candidate so already-satisfied contracts are not accidentally rerun. Preserve a separate immutable operator audit record with classification `baseline_reconciliation`, actual reconciliation time, historical file hash, checked postconditions, correction version and release approval. Never label those entries “historically executed,” infer an execution date from the version, or use stored SQL text as execution evidence. The correction's own entry is classified `forward_sql_executed` only after actual successful apply and validation. This distinction applies to all seven baseline candidates, not only the three corrected ones.

This operational interpretation follows the documented insert-only repair mechanism; Supabase does not independently certify historical equivalence. It is proposed for owner re-approval, not silently applied. If a downstream audit process requires every tracking row to prove original execution, retain those old versions unmarked and design a separately reviewed baseline snapshot/manifest instead. Do not fabricate provenance or run blind db push/migration-up; the repository still contains other unproved historical versions.

Conditional SAFE_METADATA_REPAIR_CANDIDATES remain exactly: `20260624120000`, `20260712180000`, `20260712200000`, `20260720170000`, `20260726160000`, `20260731120000`, `20260909110000`. None is authorized for repair in this preparation. The three corrected versions are blocked until the forward correction and full verification succeed on the target. Exclude `20260629120000` and `20260911100000`; never replay `20260710120000`; no UNKNOWN or unproved PARTIAL version is admitted.

## Correct execution order after re-approval

1. Reconfirm identity, writer quiescence, new release SHA, all eight hashes, catalog including comments, ledger state, and recovery point validity. Only the five known missing comments are an accepted prerequisite gap. Any other discrepancy stops the window.
2. Apply ONLY `20260920095101_restore_historical_column_comments.sql` before baseline repair, despite its newer timestamp. Verify exactly five comments and zero other schema/data changes. Re-prove all seven historical contracts. STOP on mismatch, leaving only the harmless comment correction in place; do not repair any historical version.
3. Record the successfully executed correction version in the migration ledger and verify that exact entry and unchanged business counts. Do not infer chronological execution order from sorted version values.
4. Reconcile the seven independently proven historical candidates one at a time as baseline metadata. Read back the exact ledger set and check unchanged business counts after each. Do not replay their SQL.
5. Execute the previous seven forward migrations in reviewed gate order: RLS containment, finance lease, current prices, canonical stocks, account metadata, finance RLS, atomic inventory. Validate each before recording its exact version. Final intended tracking set is seven baseline entries plus eight actually executed forward versions: fifteen entries, subject to the fresh ledger precheck.
6. Continue approved configuration, merge and six separate bounded task/account acceptance steps only under renewed approval. Stock reads remain legacy, recurring scheduling stays off, and hosting/Auth/beta actions remain excluded.

The forward count is now **eight**, but comment correction executes first. Full filenames, previous hashes and gate-specific STOP/safe-hold checkpoints remain in the [execution package](human-gate-2-execution-package.md).

The existing verified recovery artifact is retained unchanged; no new backup was taken during preparation. It remains a valid recovery artifact for its capture state. Before resuming, re-prove that production has not changed since that point; any intervening change or inability to prove unchanged state requires a new verified backup. Do not claim current recovery coverage solely from matching row counts.
