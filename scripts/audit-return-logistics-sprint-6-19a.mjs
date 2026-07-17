#!/usr/bin/env node
/**
 * Sprint 6.19A — RETURN_LOGISTICS audit (read-only).
 * Usage: npx tsx scripts/audit-return-logistics-sprint-6-19a.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import {
  effectiveFinanceCategory,
  inferCategoryFromLegacy,
  parseWbSourceSuffix,
  resolveSupplierOperName,
} from "../src/lib/finance-category.ts";
import { attributeProductFinance, buildPurchaseSridSet } from "../src/lib/product-logistics-attribution.ts";
import { buildOrdersPurchasesKpis } from "../src/lib/orders-purchases-metrics.ts";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import { getDefaultDateRange } from "../src/lib/utils.ts";
import { fetchFinanceInRange, fetchOrdersInRange, fetchProductsWithRelations, fetchSalesInRange } from "../src/services/persisted-query-service.ts";
import { resolveScopedDateRange } from "../src/lib/marketplace-scope.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { mapFinanceRowsFromReport } from "../src/lib/wildberries/mappers.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function money(n) {
  return `${Number(n).toFixed(2)} ₽`;
}

function classifyOperName(operName) {
  const n = (operName ?? "").toLowerCase();
  if (!n) return "unknown";
  if (/отмен/i.test(n)) return "cancelled";
  if (/возврат/i.test(n)) return "customer_return";
  if (/отказ/i.test(n)) return "refused_delivery";
  if (/обрат/i.test(n) || /возвратн/i.test(n)) return "reverse_logistics";
  if (/логист/i.test(n)) return "logistics_generic";
  if (/перевыстав/i.test(n) || /rebill/i.test(n)) return "rebill";
  return "other";
}

async function main() {
  loadEnv();
  const defaults = getDefaultDateRange();
  const accountId = process.argv[2] ?? "1";
  const from = process.argv[3] ?? defaults.from;
  const to = process.argv[4] ?? defaults.to;

  const client = createAdminClient();
  const scope = await resolveScopedDateRange({ account: accountId, from, to });
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client);
  const productIds = products.map((p) => String(p.id));

  const [finance, sales, orders] = await Promise.all([
    fetchFinanceInRange(scope, client, { productIds }),
    fetchSalesInRange(scope, client, { productIds }),
    fetchOrdersInRange(scope, client, { productIds }),
  ]);

  const returnRows = finance.filter((r) => effectiveFinanceCategory(r) === "RETURN_LOGISTICS");
  const logisticsRows = finance.filter((r) => effectiveFinanceCategory(r) === "LOGISTICS");

  const kpis = buildOrdersPurchasesKpis(orders, sales);
  const breakdown = assembleFinancialComponents({ sales, finance, ads: [], costHistory: [] });

  const purchaseSrids = buildPurchaseSridSet(sales);
  const { financeForBreakdown, purchaseLogisticsRows, excludedLogisticsRows, excludedLogistics } =
    attributeProductFinance(finance, purchaseSrids);

  const purchaseLogisticsTotal = financeForBreakdown
    .filter((r) => effectiveFinanceCategory(r) === "LOGISTICS")
    .reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
  const allLogisticsTotal = logisticsRows.reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  const returnSales = sales.filter((s) => s.is_return);
  const returnSrids = new Set(returnSales.map((s) => s.srid).filter(Boolean));

  const byOper = new Map();
  for (const row of returnRows) {
    const oper = resolveSupplierOperName(row) ?? "(null)";
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    const key = `${oper}|||${suffix}|||${row.operation_type}`;
    const cur = byOper.get(key) ?? {
      oper,
      suffix,
      operation_type: row.operation_type,
      rows: 0,
      amount: 0,
      withSrid: 0,
      sridMatchesReturnSale: 0,
      sridMatchesPurchase: 0,
      nullProductId: 0,
    };
    cur.rows += 1;
    cur.amount += Math.abs(Number(row.amount));
    if (row.product_id == null) cur.nullProductId += 1;
    if (row.srid) {
      cur.withSrid += 1;
      if (returnSrids.has(row.srid)) cur.sridMatchesReturnSale += 1;
      if (purchaseSrids.has(row.srid)) cur.sridMatchesPurchase += 1;
    }
    byOper.set(key, cur);
  }

  const operBuckets = new Map();
  for (const row of returnRows) {
    const oper = resolveSupplierOperName(row) ?? "(null)";
    const bucket = classifyOperName(oper);
    const cur = operBuckets.get(bucket) ?? { rows: 0, amount: 0 };
    cur.rows += 1;
    cur.amount += Math.abs(Number(row.amount));
    operBuckets.set(bucket, cur);
  }

  console.log("Sprint 6.19A — RETURN_LOGISTICS Audit");
  console.log(`Account ${scope.marketplaceAccountId} | ${from} → ${to}\n`);

  console.log("=== Dashboard comparison ===");
  console.log(`Cancelled Orders (qty):     ${kpis.cancelledOrdersCount}`);
  console.log(`Cancelled Orders (amount):  ${money(kpis.cancelledOrdersAmount)}`);
  console.log(`Return sales (qty):         ${returnSales.reduce((s, r) => s + r.quantity, 0)}`);
  console.log(`Return Logistics (finance): ${money(breakdown.returnLogistics)} (${returnRows.length} rows)`);
  console.log(`Logistics (finance):        ${money(breakdown.logistics)} (${logisticsRows.length} rows)`);
  console.log();

  console.log("=== RETURN_LOGISTICS by supplier_oper_name + suffix ===");
  const sorted = [...byOper.values()].sort((a, b) => b.amount - a.amount);
  for (const g of sorted) {
    console.log(
      `  ${g.oper} | suffix=${g.suffix} | op_type=${g.operation_type} | rows=${g.rows} | ${money(g.amount)} | srid: ${g.withSrid}/${g.rows} | matches_return_sale=${g.sridMatchesReturnSale} | matches_purchase=${g.sridMatchesPurchase} | null_product=${g.nullProductId}`
    );
  }
  console.log();

  console.log("=== Semantic breakdown (supplier_oper_name heuristics) ===");
  for (const [bucket, data] of [...operBuckets.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    console.log(`  ${bucket}: ${data.rows} rows, ${money(data.amount)}`);
  }
  console.log();

  console.log("=== SRID linkage ===");
  const returnWithSrid = returnRows.filter((r) => r.srid);
  const returnSridMatchReturn = returnWithSrid.filter((r) => returnSrids.has(r.srid)).length;
  const returnSridMatchPurchase = returnWithSrid.filter((r) => purchaseSrids.has(r.srid)).length;
  console.log(`RETURN_LOGISTICS rows with SRID:              ${returnWithSrid.length}/${returnRows.length}`);
  console.log(`  SRID matches a return sale in period:      ${returnSridMatchReturn}`);
  console.log(`  SRID matches a completed purchase in period: ${returnSridMatchPurchase}`);
  console.log();

  console.log("=== Purchase Logistics attribution ===");
  console.log(`All LOGISTICS finance rows:        ${logisticsRows.length} | ${money(allLogisticsTotal)}`);
  console.log(`Purchase-matched LOGISTICS rows:   ${purchaseLogisticsRows} | ${money(purchaseLogisticsTotal)}`);
  console.log(`Excluded LOGISTICS rows:           ${excludedLogisticsRows} | ${money(excludedLogistics)}`);
  console.log(`Excluded as % of all logistics:    ${allLogisticsTotal > 0 ? ((excludedLogistics / allLogisticsTotal) * 100).toFixed(1) : 0}%`);
  console.log();

  const excludedByOper = new Map();
  for (const row of logisticsRows) {
    if (row.srid && purchaseSrids.has(row.srid)) continue;
    const oper = resolveSupplierOperName(row) ?? "(null)";
    const cur = excludedByOper.get(oper) ?? { rows: 0, amount: 0 };
    cur.rows += 1;
    cur.amount += Math.abs(Number(row.amount));
    excludedByOper.set(oper, cur);
  }
  console.log("=== Excluded LOGISTICS (not purchase-matched) top supplier_oper_name ===");
  for (const [oper, data] of [...excludedByOper.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 15)) {
    console.log(`  ${oper}: ${data.rows} rows, ${money(data.amount)}`);
  }
  console.log();

  console.log("=== Mapping table (code paths) ===");
  const mappingTable = [
    ["WB field rebill_logistic_cost", "return_logistics suffix", "RETURN_LOGISTICS", "No", "Yes", "Primary WB reverse logistics rebill field"],
    ["WB delivery_rub + oper name contains логист+обрат", "oper_return_logistics suffix", "RETURN_LOGISTICS", "No", "Yes", "Fallback when no other line emitted"],
    ["WB delivery_rub", "logistics suffix", "LOGISTICS", "Yes (if SRID matches purchase)", "No", "Outbound delivery_rub on report row"],
    ["WB delivery_rub + oper name contains логист (not обрат)", "oper_logistics suffix", "LOGISTICS", "Yes (if SRID matches purchase)", "No", "Fallback outbound logistics"],
  ];
  console.log("| WB source | Mapped suffix | Category | Purchase Logistics? | Return Logistics? | Reason |");
  console.log("|-----------|---------------|----------|---------------------|-------------------|--------|");
  for (const row of mappingTable) {
    console.log(`| ${row.join(" | ")} |`);
  }
  console.log();

  console.log("=== WB API evidence (reportDetailByPeriod) ===");
  try {
    const account = await getMarketplaceAccountForSync(scope.marketplaceAccountId);
    const wb = new WbApiClient(account.apiKey);
    const apiRows = await wb.fetchFinanceReport(from, to);

    const returnApiRows = apiRows.filter((r) => Math.abs(r.rebill_logistic_cost ?? 0) > 0);
    const operReturnFallback = apiRows.filter((r) => {
      const oper = (r.supplier_oper_name ?? "").toLowerCase();
      const hasRebill = Math.abs(r.rebill_logistic_cost ?? 0) > 0;
      const hasDelivery = Math.abs(r.delivery_rub ?? 0) > 0;
      return !hasRebill && hasDelivery && oper.includes("логист") && oper.includes("обрат");
    });

    const apiByOper = new Map();
    for (const row of returnApiRows) {
      const oper = row.supplier_oper_name?.trim() || "(null)";
      const cur = apiByOper.get(oper) ?? { rows: 0, rebill: 0, delivery: 0 };
      cur.rows += 1;
      cur.rebill += Math.abs(row.rebill_logistic_cost ?? 0);
      cur.delivery += Math.abs(row.delivery_rub ?? 0);
      apiByOper.set(oper, cur);
    }

    console.log(`API rows in range: ${apiRows.length}`);
    console.log(`API rows with rebill_logistic_cost > 0: ${returnApiRows.length}`);
    console.log(`API rows with oper_return_logistics fallback pattern: ${operReturnFallback.length}`);
    console.log("Top supplier_oper_name on rebill_logistic_cost rows:");
    for (const [oper, data] of [...apiByOper.entries()].sort((a, b) => b[1].rebill - a[1].rebill).slice(0, 20)) {
      console.log(`  ${oper}: ${data.rows} rows | rebill=${money(data.rebill)} | delivery_rub=${money(data.delivery)}`);
    }

    const apiSemantic = new Map();
    for (const row of returnApiRows) {
      const bucket = classifyOperName(row.supplier_oper_name);
      const cur = apiSemantic.get(bucket) ?? { rows: 0, amount: 0 };
      cur.rows += 1;
      cur.amount += Math.abs(row.rebill_logistic_cost ?? 0);
      apiSemantic.set(bucket, cur);
    }
    console.log("\nAPI rebill_logistic_cost semantic buckets:");
    for (const [bucket, data] of [...apiSemantic.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
      console.log(`  ${bucket}: ${data.rows} rows, ${money(data.amount)}`);
    }

    if (returnApiRows[0]) {
      const sample = returnApiRows[0];
      console.log("\nSample API row with rebill_logistic_cost:");
      console.log(
        JSON.stringify(
          {
            rrd_id: sample.rrd_id,
            supplier_oper_name: sample.supplier_oper_name,
            rebill_logistic_cost: sample.rebill_logistic_cost,
            delivery_rub: sample.delivery_rub,
            srid: sample.srid,
            nm_id: sample.nm_id,
          },
          null,
          2
        )
      );
    }

    const deliveryApiRows = apiRows.filter((r) => Math.abs(r.delivery_rub ?? 0) > 0);
    const deliveryByOper = new Map();
    for (const row of deliveryApiRows) {
      const oper = row.supplier_oper_name?.trim() || "(null)";
      const cur = deliveryByOper.get(oper) ?? { rows: 0, delivery: 0 };
      cur.rows += 1;
      cur.delivery += Math.abs(row.delivery_rub ?? 0);
      deliveryByOper.set(oper, cur);
    }
    console.log(`\nAPI rows with delivery_rub > 0: ${deliveryApiRows.length}`);
    console.log("Top supplier_oper_name on delivery_rub rows (→ LOGISTICS):");
    for (const [oper, data] of [...deliveryByOper.entries()].sort((a, b) => b[1].delivery - a[1].delivery)) {
      console.log(`  ${oper}: ${data.rows} rows | delivery_rub=${money(data.delivery)}`);
    }
  } catch (error) {
    console.log(`WB API fetch skipped/failed: ${error instanceof Error ? error.message : error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
