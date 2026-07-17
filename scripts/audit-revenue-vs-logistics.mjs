#!/usr/bin/env node
/**
 * Prove Revenue (Net Sales) vs Logistics data sources and date axes.
 * Usage: node scripts/audit-revenue-vs-logistics.mjs [accountId] [days]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import { buildNetSalesFromDb, resolveNetSalesFromSources } from "../src/lib/sales-revenue-resolution.ts";
import { rollupCategoriesToProfitBuckets } from "../src/lib/finance-rollup.ts";
import { effectiveFinanceCategory, parseWbSourceSuffix } from "../src/lib/finance-category.ts";
import { buildInclusiveDateRange } from "../src/lib/utils.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function fetchAll(client, table, col, accountId, from, to, extra = {}) {
  const rows = [];
  let offset = 0;
  while (true) {
    let q = client
      .from(table)
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte(col, from)
      .lte(col, to)
      .range(offset, offset + 999);
    for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

loadEnv();
const accountId = process.argv[2] ?? "1";
const days = Number(process.argv[3] ?? 90);
const { from, to } = buildInclusiveDateRange(days);

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const [sales, finance, products] = await Promise.all([
  fetchAll(client, "wb_sales", "sale_date", accountId, from, to),
  fetchAll(client, "wb_finance", "operation_date", accountId, from, to),
  fetchAll(client, "products", "marketplace_account_id", accountId, from, to).catch(() => []),
]);

// Product filter like dashboard
const { data: productRows } = await client
  .from("products")
  .select("id")
  .eq("marketplace_account_id", accountId);
const productIds = (productRows ?? []).map((p) => String(p.id));

const financeFiltered = finance.filter(
  (r) => !r.product_id || productIds.includes(String(r.product_id))
);

const breakdown = assembleFinancialComponents({
  sales,
  finance: financeFiltered,
  ads: [],
  costHistory: [],
});

const netSalesDb = buildNetSalesFromDb(sales);
const netSalesRes = resolveNetSalesFromSources({
  sales,
  scopeFrom: from,
  scopeTo: to,
});

const financeBuckets = rollupCategoriesToProfitBuckets(financeFiltered);
const totalLogistics = breakdown.logistics + breakdown.returnLogistics;

// Finance for_pay lines (settlement revenue axis)
let financeForPay = 0;
let financeForPayLines = 0;
for (const row of financeFiltered) {
  if (parseWbSourceSuffix(row.source_key, row.wb_source_suffix) === "for_pay") {
    financeForPay += Number(row.amount);
    financeForPayLines++;
  }
}

// Logistics finance rows detail
const logisticsRows = financeFiltered.filter((r) => {
  const cat = effectiveFinanceCategory(r);
  return cat === "LOGISTICS" || cat === "RETURN_LOGISTICS";
});

// Sales SRIDs in period
const saleSrids = new Set(sales.map((s) => s.srid).filter(Boolean));
const logisticsWithSrid = logisticsRows.filter((r) => r.srid);
const logisticsNoMatchingSale = logisticsWithSrid.filter((r) => !saleSrids.has(r.srid));
const logisticsNoSrid = logisticsRows.filter((r) => !r.srid);

const sumNoMatch = logisticsNoMatchingSale.reduce((a, r) => a + Math.abs(Number(r.amount)), 0);
const sumNoSrid = logisticsNoSrid.reduce((a, r) => a + Math.abs(Number(r.amount)), 0);

// Cross-date: sales with sale_date in range but check if logistics operation_date differs
// Sales outside finance cohort: sale_date in range vs finance operation_date in range - already separate fetches

console.log(
  JSON.stringify(
    {
      scope: { accountId, days, from, to },
      dashboardKpis: {
        netSalesModelB: round2(netSalesRes.netSales),
        netSalesStatus: netSalesRes.status,
        netSalesDataSource: netSalesRes.dataSource,
        netSalesFromDb: round2(netSalesDb.netSales),
        logisticsKpi: round2(totalLogistics),
        logisticsOnly: round2(breakdown.logistics),
        returnLogistics: round2(breakdown.returnLogistics),
        legacyRevenueFinishedPrice: round2(breakdown.revenue),
      },
      rowCounts: {
        wb_sales_sale_date: sales.length,
        wb_finance_operation_date: financeFiltered.length,
        logisticsFinanceRows: logisticsRows.length,
      },
      dataSourceProof: {
        revenueTable: "wb_sales (NOT wb_finance)",
        revenueDateColumn: "sale_date",
        logisticsTable: "wb_finance",
        logisticsDateColumn: "operation_date",
        sameRowSet: false,
        sameDateColumn: false,
      },
      financeAlternativeRevenue: {
        sumForPayLines: round2(financeForPay),
        forPayLineCount: financeForPayLines,
        note: "Model B Revenue uses Sales API priceWithDisc, not finance for_pay",
      },
      logisticsAttribution: {
        totalLogistics: round2(totalLogistics),
        rowsWithSridNoSaleInPeriod: logisticsNoMatchingSale.length,
        amountSridNoSaleInPeriod: round2(sumNoMatch),
        pctOfLogistics: totalLogistics > 0 ? round2((sumNoMatch / totalLogistics) * 100) : 0,
        rowsWithoutSrid: logisticsNoSrid.length,
        amountWithoutSrid: round2(sumNoSrid),
      },
      financeBuckets: {
        commission: round2(financeBuckets.commission),
        logistics: round2(financeBuckets.logistics),
        return_logistics: round2(financeBuckets.return_logistics),
        storage: round2(financeBuckets.storage),
        penalty: round2(financeBuckets.penalty),
        other: round2(financeBuckets.other),
      },
      whyLogisticsExceedsRevenue: [
        "Revenue (Net Sales) = wb_sales.price_with_disc by sale_date",
        "Logistics = wb_finance LOGISTICS+RETURN_LOGISTICS by operation_date",
        "Different tables, different date axes, different economic events",
        `${logisticsNoMatchingSale.length} logistics rows have SRID not in period sales (${round2(sumNoMatch)} ₽)`,
      ],
      sampleLogisticsNoSale: logisticsNoMatchingSale.slice(0, 5).map((r) => ({
        operation_date: r.operation_date,
        amount: r.amount,
        srid: r.srid,
        category: effectiveFinanceCategory(r),
        suffix: parseWbSourceSuffix(r.source_key, r.wb_source_suffix),
      })),
      sampleSales: sales.slice(0, 3).map((s) => ({
        sale_date: s.sale_date,
        price_with_disc: s.price_with_disc,
        revenue: s.revenue,
        is_return: s.is_return,
        srid: s.srid,
      })),
    },
    null,
    2
  )
);
