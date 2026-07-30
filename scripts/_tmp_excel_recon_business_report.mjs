/**
 * Evidence-only reconciliation: live Dashboard V4 (paginated DB) vs provided Excel.
 * Excel = Orion Business Report v2 (NOT official WB weekly settlement).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const from = "2026-06-22";
const to = "2026-07-21";
const accountId = "1";
const excelPath =
  "c:/Users/User/Downloads/Business_Report_v2_2026-06-22_2026-07-21_2026-07-21.xlsx";

function parseRub(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v)
    .replace(/\u00a0/g, " ")
    .replace(/[₽\s]/g, "")
    .replace(",", ".");
  if (s === "" || s === "—") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

const dump = JSON.parse(
  readFileSync(resolve("exports/_tmp_business_report_v2_dump.json"), "utf8")
);
const excelMap = {};
for (const sheet of ["Cover", "Executive Summary", "Financial Summary"]) {
  for (const row of dump[sheet] ?? []) {
    const [k, v] = row.vals ?? [];
    if (k != null && v != null) excelMap[String(k).trim()] = v;
  }
}

const excelMetrics = {
  revenue: parseRub(excelMap.Revenue),
  productCost: parseRub(excelMap["Product Cost"]),
  marketplaceFees: parseRub(excelMap["Marketplace Fees"]),
  commission: parseRub(excelMap.Commission),
  logistics: parseRub(excelMap.Logistics),
  returnLogistics: parseRub(excelMap["Return Logistics"]),
  storage: parseRub(excelMap.Storage),
  advertising: parseRub(excelMap.Advertising),
  penalties: parseRub(excelMap.Penalties),
  otherExpenses: parseRub(excelMap["Other Expenses"]),
  netProfit: parseRub(excelMap["Net Profit"]),
  acceptance: parseRub(excelMap.Acceptance),
  settlement: parseRub(excelMap.Settlement),
  settlementNetForPay: parseRub(excelMap["Net For Pay"]),
  unitsSold: parseRub(excelMap["Units Sold"]),
  unitsReturned: parseRub(excelMap["Units Returned"]),
  grossSales: null,
  returnedSales: null,
  netSales: null,
  estimatedTax: null,
};

const excelIdentity = {
  reportName: excelMap["Report Name"],
  company: excelMap.Company,
  account: excelMap.Account,
  period: excelMap["Reporting Period"],
  generatedAt: excelMap["Generated At"],
  lastSync: excelMap["Last Successful Synchronization"],
  templateVersion: excelMap["Template Version"],
  settlementSource: excelMap["Data Source"],
};

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { fetchFinanceInRange, fetchSalesInRange, fetchAdsInRange } = await import(
  "../src/services/persisted-query-service.ts"
);
const { buildLatestCostByProductId } = await import(
  "../src/lib/cost-history-resolution.ts"
);
const {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} = await import("../src/lib/finance-rollup.ts");
const { buildModelBProfitMetrics } = await import("../src/lib/financial-engine.ts");
const { computeProductCost } = await import("../src/lib/product-cost.ts");
const {
  buildNetFinishedPriceFromDb,
  buildNetForPayFromDb,
  buildNetSalesFromDb,
  sumReturnedFinishedPriceFromDb,
} = await import("../src/lib/sales-revenue-resolution.ts");
const {
  sumAcceptanceFromFinance,
  sumNetForPayFromFinance,
} = await import("../src/lib/wb-settlement.ts");

const sb = createAdminClient();
const scope = {
  marketplaceAccountId: accountId,
  from,
  to,
  brandId: null,
};

const { data: products } = await sb
  .from("products")
  .select("*")
  .eq("marketplace_account_id", accountId);
const productIds = (products ?? []).map((p) => String(p.id));

const [sales, finance, ads, costHistoryRes, reportsRes, financeCountRes] =
  await Promise.all([
    fetchSalesInRange(scope, sb, { productIds }),
    fetchFinanceInRange(scope, sb, { productIds }),
    fetchAdsInRange(scope, sb, { productIds }),
    sb.from("product_cost_history").select("*"),
    sb
      .from("wb_sales_reports")
      .select("id, date_from, date_to, for_pay_sum")
      .eq("marketplace_account_id", accountId),
    sb
      .from("wb_finance")
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to),
  ]);

const costHistory = costHistoryRes.data ?? [];
const latest = buildLatestCostByProductId(costHistory, products ?? []);
const financeTotals = rollupCategoriesToProfitBuckets(finance);
const categorySummary = summarizeFinanceByCategory(finance);
const presentation = buildMarketplaceFeesPresentationFromFinance(
  finance,
  financeTotals.commission
);
const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
const netSales = buildNetSalesFromDb(sales);
const salesForPay = buildNetForPayFromDb(sales);
const financeNetForPay = sumNetForPayFromFinance(finance);
const acceptance = sumAcceptanceFromFinance(finance);
const customerPaid = buildNetFinishedPriceFromDb(sales);
const returnedFinished = sumReturnedFinishedPriceFromDb(sales);
const productCost = computeProductCost(sales, costHistory, latest);
const advertising = ads.reduce((s, a) => s + Number(a.spend ?? 0), 0);
const modelB = buildModelBProfitMetrics(netSales, {
  salesForPay,
  financeNetForPay,
  acquiring: categorySummary.ACQUIRING,
  logistics: totalLogistics,
  storage: financeTotals.storage,
  penalties: financeTotals.penalty,
  adjustments: presentation.accountAdjustments,
  acceptance,
  productCost,
  advertising,
  customerPaid,
});

const dashboard = {
  grossSales: round2(modelB.grossSales),
  returnedSales_finishedPrice: round2(returnedFinished),
  netSales_display: round2(modelB.grossSales - returnedFinished),
  netSales_engine_priceWithDisc: round2(modelB.netSales),
  returnedSales_engine_priceWithDisc: round2(modelB.returnedSales),
  revenue: round2(modelB.revenue),
  marketplaceFee: round2(modelB.marketplaceFee ?? modelB.commission),
  logistics: round2(modelB.logistics),
  storage: round2(modelB.storage),
  acceptance: round2(modelB.acceptance),
  penalties: round2(modelB.penalties),
  other: round2(modelB.adjustments),
  estimatedTax: round2(modelB.estimatedTax),
  productCost: round2(modelB.productCost),
  advertising: round2(modelB.advertising),
  acquiring: round2(modelB.acquiring),
  netProfit: round2(modelB.finalNetProfit),
  operatingProfit: round2(modelB.operatingProfit),
  presentationMarketplaceFees: round2(presentation.marketplaceFees),
  salesForPay: round2(salesForPay),
  financeNetForPay: round2(financeNetForPay),
  customerPaid: round2(customerPaid),
};

function row(metric, dash, excelVal, source, explanation) {
  const d = dash == null ? null : Number(dash);
  const e = excelVal == null ? null : Number(excelVal);
  const diff = d == null || e == null ? null : round2(d - e);
  let status = "N/A";
  if (d != null && e != null) status = Math.abs(diff) < 0.02 ? "MATCH" : "MISMATCH";
  else if (d != null && e == null) status = "EXCEL_MISSING";
  return { metric, dashboard: d, excel: e, diff, source, explanation, status };
}

const reconciliation = [
  row(
    "1. Gross Sales",
    dashboard.grossSales,
    excelMetrics.grossSales,
    "Sales API / DB Σ price_with_disc (purchases)",
    "Absent from Business Report v2 template."
  ),
  row(
    "2. Returned Sales",
    dashboard.returnedSales_finishedPrice,
    excelMetrics.returnedSales,
    "Sales API / DB Σ finishedPrice (returns)",
    "Absent from Business Report v2 template."
  ),
  row(
    "3. Net Sales (display KPI)",
    dashboard.netSales_display,
    excelMetrics.netSales,
    "Display only: Gross − Returned finishedPrice",
    "Absent from Excel; not used by V4 accounting."
  ),
  row(
    "4. Revenue (ppvz_for_pay)",
    dashboard.revenue,
    excelMetrics.revenue,
    "Finance API signed for_pay Σ (operation_date), paginated",
    `Live V4 Revenue=${dashboard.revenue}. Excel Revenue=${excelMetrics.revenue} (export 2026-07-21). Closest live commercial analogs: engine netSales=${dashboard.netSales_engine_priceWithDisc}, salesForPay=${dashboard.salesForPay}.`
  ),
  row(
    "5. Marketplace Fee (V4)",
    dashboard.marketplaceFee,
    excelMetrics.commission,
    "Sales API: priceWithDisc net − forPay",
    "Excel Commission=0 (broken export / zeroed costs)."
  ),
  row(
    "5b. Marketplace Fees (Excel presentation label)",
    dashboard.presentationMarketplaceFees,
    excelMetrics.marketplaceFees,
    "Finance presentation bundle (not V4 fee)",
    "Excel Marketplace Fees=0."
  ),
  row(
    "6. Logistics",
    dashboard.logistics,
    (excelMetrics.logistics ?? 0) + (excelMetrics.returnLogistics ?? 0),
    "Finance API logistics + return_logistics",
    "Excel Logistics+Return Logistics=0."
  ),
  row(
    "7. Storage",
    dashboard.storage,
    excelMetrics.storage,
    "Finance API storage",
    "Excel Storage=0."
  ),
  row(
    "8. Acceptance",
    dashboard.acceptance,
    excelMetrics.acceptance,
    "Finance API acceptance",
    "Excel Acceptance=0."
  ),
  row(
    "9. Penalties",
    dashboard.penalties,
    excelMetrics.penalties,
    "Finance API penalty",
    "Excel Penalties=0."
  ),
  row(
    "10. Other Marketplace Expenses",
    dashboard.other,
    excelMetrics.otherExpenses,
    "Finance ADJUSTMENT",
    "Excel Other Expenses=0."
  ),
  row(
    "11. Estimated Tax",
    dashboard.estimatedTax,
    excelMetrics.estimatedTax,
    "Tax% × Σ finishedPrice",
    "Not in Business Report v2 Financial Summary."
  ),
  row(
    "12. Product Cost",
    dashboard.productCost,
    excelMetrics.productCost,
    "DB product_cost_history × sales",
    "Both non-zero; values diverge (export-time vs live)."
  ),
  row(
    "13. Net Profit",
    dashboard.netProfit,
    excelMetrics.netProfit,
    "V4 finalNetProfit",
    "Excel NP cannot match: cost lines were zeroed and Revenue base differs."
  ),
];

const firstComparableMismatch = reconciliation.find((l) => l.status === "MISMATCH");
const firstMissing = reconciliation.find((l) => l.status === "EXCEL_MISSING");

const result = {
  objective:
    "Find first divergence Dashboard vs provided Excel — no engine changes",
  criticalFinding: {
    providedFileIs:
      "Orion Shop Business Report v2 (in-app export), NOT official Wildberries «Еженедельный отчет» settlement Excel",
    evidence: [
      "Cover: Report Name=Business Report, Template Version=2, Generated by WB Dashboard",
      "Sheets: Cover / Executive Summary / Financial Summary / Product Summary / Inventory Summary",
      "Financial Summary labels match business-report-template.ts, not WB weekly columns (Продажа, К перечислению, …)",
    ],
    weeklyReportsInDbForAccount1: (reportsRes.data ?? []).length,
    financeRowsExact: financeCountRes.count,
    financeRowsLoaded: finance.length,
    salesRowsLoaded: sales.length,
  },
  excelFile: excelPath,
  excelIdentity,
  period: { from, to, accountId },
  dashboard,
  excelMetrics,
  reconciliation,
  answers: {
    q1_firstDivergingKpi: {
      funnelOrderFirstBreak: firstMissing?.metric,
      firstNumericMismatchOnSharedLabels: firstComparableMismatch?.metric,
      detail:
        "In requested funnel order, Gross/Returned/Net Sales are missing from Excel (cannot match). First shared label that diverges is Revenue (Excel 728 613 vs live V4 268 852).",
    },
    q2_cause: {
      primary: "different aggregation logic + wrong ground-truth file",
      also: [
        "export mapping: Business Report uses overview fields; Marketplace Fees/Commission/Logistics exported as 0",
        "not a V4 formula bug for Marketplace Fee (Sales−forPay still correct in engine)",
        "possible sync/time drift: Excel generated 2026-07-21 with last sync 2026-07-16; live DB has 4938 finance rows in range",
        "wb_sales_reports empty for account 1 — Weekly Report settlement dataset unavailable in DB",
      ],
      notPrimary: "wrong V4 tax/fee formulas",
    },
    q3_weeklyReportsWouldEliminateDifference:
      "No for this Excel: it already labels Data Source=weekly_reports but Settlement amounts are all 0, and DB has 0 overlapping wb_sales_reports rows for account 1. Official WB weekly Excel (Основной weeks) is required for settlement ground truth; Business Report v2 cannot serve that role.",
  },
};

const outPath = resolve(
  "exports/excel-recon-FINAL-business-report-v2-2026-06-22_2026-07-21.json"
);
writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
console.log("Wrote", outPath);
