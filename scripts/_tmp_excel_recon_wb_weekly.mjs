/**
 * Evidence-only: Dashboard V4 vs official WB weekly settlement Excel.
 * Do not modify Financial Engine.
 *
 * Period: Excel weeks overlapping 2026-01-01 → 2026-07-19, Тип отчета = Основной only.
 * (File: Еженедельный отчет 2024-01-29 - 2026-07-19; exclude По выкупам to avoid double-count.)
 */
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const EXCEL =
  "C:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx";
const FROM = "2026-01-01";
const TO = "2026-07-19";
const ACCOUNT = "1";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const toYmd = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};
const overlaps = (a, b, from, to) => a <= to && b >= from;

// --- Excel ---
const wb = XLSX.readFile(EXCEL, { cellDates: true });
const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: null,
  raw: true,
});
const header = grid[0].map((h) => String(h ?? ""));
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const otherIdx =
  idx["Прочие удержания/выплаты"] ??
  header.findIndex((h) => /удерж/i.test(h) || h === '"x' || h === "x");

const excelRows = [];
for (let i = 1; i < grid.length; i++) {
  const row = grid[i];
  if (!row?.[0]) continue;
  const start = toYmd(row[idx["Дата начала"]]);
  const end = toYmd(row[idx["Дата конца"]]);
  const type = row[idx["Тип отчета"]] == null ? null : String(row[idx["Тип отчета"]]);
  if (!start || !end) continue;
  if (!overlaps(start, end, FROM, TO)) continue;
  if (type !== "Основной") continue;
  excelRows.push({
    id: String(row[idx["№ отчета"]]),
    start,
    end,
    prodazha: num(row[idx["Продажа"]]),
    k: num(row[idx["К перечислению за товар"]]),
    logistics: num(row[idx["Стоимость логистики"]]),
    storage: num(row[idx["Стоимость хранения"]]),
    acceptance: num(row[idx["Стоимость операций на приемке"]]),
    other: otherIdx >= 0 ? num(row[otherIdx]) : 0,
    penalties: num(row[idx["Общая сумма штрафов"]]),
    totalPay: num(row[idx["Итого к оплате"]]),
    vvAdj: num(row[idx["Корректировка Вознаграждения Вайлдберриз (ВВ)"]]),
  });
}

// Deduplicate by week id (same report number)
const byId = new Map();
for (const r of excelRows) byId.set(r.id, r);
const uniqueWeeks = [...byId.values()];

const excel = {
  n: uniqueWeeks.length,
  prodazha: 0,
  k: 0,
  logistics: 0,
  storage: 0,
  acceptance: 0,
  other: 0,
  penalties: 0,
  totalPay: 0,
  vvAdj: 0,
};
for (const r of uniqueWeeks) {
  excel.prodazha += r.prodazha;
  excel.k += r.k;
  excel.logistics += r.logistics;
  excel.storage += r.storage;
  excel.acceptance += r.acceptance;
  excel.other += r.other;
  excel.penalties += r.penalties;
  excel.totalPay += r.totalPay;
  excel.vvAdj += r.vvAdj;
}
for (const k of Object.keys(excel)) if (k !== "n") excel[k] = r2(excel[k]);
excel.impliedFee = r2(excel.prodazha - excel.k);

// --- Dashboard / DB (paginated) ---
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
const scope = { marketplaceAccountId: ACCOUNT, from: FROM, to: TO, brandId: null };
const { data: products } = await sb
  .from("products")
  .select("*")
  .eq("marketplace_account_id", ACCOUNT);
const productIds = (products ?? []).map((p) => String(p.id));

const [sales, finance, ads, costRes, reportsRes] = await Promise.all([
  fetchSalesInRange(scope, sb, { productIds }),
  fetchFinanceInRange(scope, sb, { productIds }),
  fetchAdsInRange(scope, sb, { productIds }),
  sb.from("product_cost_history").select("*"),
  sb
    .from("wb_sales_reports")
    .select("id, date_from, date_to, for_pay_sum")
    .eq("marketplace_account_id", ACCOUNT),
]);

const costHistory = costRes.data ?? [];
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

const dash = {
  grossSales: r2(modelB.grossSales),
  returnedSales: r2(returnedFinished),
  netSales_display: r2(modelB.grossSales - returnedFinished),
  netSales_engine: r2(modelB.netSales),
  returnedSales_engine_pwd: r2(modelB.returnedSales),
  revenue: r2(modelB.revenue),
  marketplaceFee: r2(modelB.marketplaceFee ?? modelB.commission),
  logistics: r2(modelB.logistics),
  storage: r2(modelB.storage),
  acceptance: r2(modelB.acceptance),
  penalties: r2(modelB.penalties),
  other: r2(modelB.adjustments),
  estimatedTax: r2(modelB.estimatedTax),
  productCost: r2(modelB.productCost),
  netProfit: r2(modelB.finalNetProfit),
  salesForPay: r2(salesForPay),
  customerPaid: r2(customerPaid),
  acquiring: r2(modelB.acquiring),
  presentationFees: r2(presentation.marketplaceFees),
};

function row(metric, dashboard, excelVal, source, explanation, opts = {}) {
  const d = dashboard == null ? null : Number(dashboard);
  const e = excelVal == null ? null : Number(excelVal);
  const diff = d == null || e == null ? null : r2(d - e);
  let status = "N/A";
  if (d != null && e != null) {
    const tol = opts.tol ?? 1;
    status = Math.abs(diff) <= tol ? "MATCH" : Math.abs(diff) <= 100 ? "NEAR" : "MISMATCH";
  } else if (d != null && e == null) status = "EXCEL_MISSING";
  else if (d == null && e != null) status = "DASH_MISSING";
  return { metric, dashboard: d, excel: e, diff, source, explanation, status };
}

const reconciliation = [
  row(
    "1. Gross Sales",
    dash.grossSales,
    null,
    "Sales API / DB Σ priceWithDisc (purchases)",
    "Weekly Excel has no Gross Sales column. Excel «Продажа» is a realized weekly retail total, not Σ priceWithDisc purchases."
  ),
  row(
    "2. Returned Sales",
    dash.returnedSales,
    null,
    "Sales API / DB Σ finishedPrice (returns)",
    "Weekly Excel summary has no returned-sales / refund column."
  ),
  row(
    "3. Net Sales (display KPI)",
    dash.netSales_display,
    excel.prodazha,
    "Display: Gross − Returned finishedPrice · Excel: Продажа",
    "Different definitions. Display Net Sales mixes priceWithDisc gross with finishedPrice returns. Excel Продажа is WB weekly realized retail. Engine commercial net (priceWithDisc)=" +
      dash.netSales_engine +
      "; finishedPrice net=" +
      dash.customerPaid +
      "."
  ),
  row(
    "3b. Engine Net Sales (priceWithDisc) vs Excel Продажа",
    dash.netSales_engine,
    excel.prodazha,
    "Sales API priceWithDisc net · Excel Продажа",
    "Same commercial intent family, but Excel Продажа ≠ priceWithDisc (SPP / retail realization / week axis)."
  ),
  row(
    "4. Revenue (ppvz_for_pay)",
    dash.revenue,
    excel.k,
    "Finance API signed for_pay (operation_date) · Excel: К перечислению за товар",
    "Closest Excel analog to V4 Revenue. Residual from week-report axis vs operation_date axis / coverage."
  ),
  row(
    "5. Marketplace Fee",
    dash.marketplaceFee,
    excel.impliedFee,
    "Sales API: priceWithDisc net − forPay · Excel implied: Продажа − К перечислению",
    "Excel has no Marketplace Fee column; implied fee can be negative when К > Продажа. Not the same identity as Sales−forPay."
  ),
  row(
    "6. Logistics",
    dash.logistics,
    excel.logistics,
    "Finance LOGISTICS+RETURN_LOGISTICS (operation_date) · Excel: Стоимость логистики",
    "Same concept; date axis (operation_date vs report week) and Основной-only Excel filter drive residual."
  ),
  row(
    "7. Storage",
    dash.storage,
    excel.storage,
    "Finance storage · Excel: Стоимость хранения",
    "Same concept; residual from date axis / classification."
  ),
  row(
    "8. Acceptance",
    dash.acceptance,
    excel.acceptance,
    "Finance acceptance · Excel: Стоимость операций на приемке",
    "Same concept."
  ),
  row(
    "9. Penalties",
    dash.penalties,
    excel.penalties,
    "Finance penalty · Excel: Общая сумма штрафов",
    "Same concept."
  ),
  row(
    "10. Other Marketplace Expenses",
    dash.other,
    excel.other,
    "Finance ADJUSTMENT · Excel: Прочие удержания/выплаты",
    "Near-analog columns; classification / axis residuals."
  ),
  row(
    "11. Estimated Tax",
    dash.estimatedTax,
    null,
    "Tax% × Σ finishedPrice",
    "Not present in WB weekly settlement Excel."
  ),
  row(
    "12. Product Cost",
    dash.productCost,
    null,
    "DB product_cost_history × sales",
    "Seller cost — not a WB weekly settlement field."
  ),
  row(
    "13. Net Profit",
    dash.netProfit,
    excel.totalPay,
    "V4 finalNetProfit · Excel: Итого к оплате",
    "Different economics. Excel Итого = settlement cash after logistics/storage/holds. V4 Net Profit = Revenue − PC − costs − ads − tax. Not comparable 1:1."
  ),
];

// First divergence in requested funnel order (1→13), treating EXCEL_MISSING as structural break
const funnel = reconciliation.filter((r) => !r.metric.startsWith("3b"));
const firstStructural = funnel.find((r) => r.status === "EXCEL_MISSING");
const firstNumeric = funnel.find(
  (r) => r.status === "MISMATCH" || r.status === "NEAR"
);

const overlappingReports = (reportsRes.data ?? []).filter((r) => {
  const a = String(r.date_from).slice(0, 10);
  const b = String(r.date_to).slice(0, 10);
  return a <= TO && b >= FROM;
});

const result = {
  objective:
    "Identify first divergence Dashboard V4 vs official WB weekly Excel — no engine changes",
  excelFile: EXCEL,
  period: {
    from: FROM,
    to: TO,
    accountId: ACCOUNT,
    excelFilter: "Тип отчета = Основной only; weeks overlapping period; unique report id",
    excelWeeks: excel.n,
  },
  counts: {
    salesRows: sales.length,
    financeRows: finance.length,
    adsRows: ads.length,
    weeklyReportsInDb: (reportsRes.data ?? []).length,
    weeklyReportsOverlapping: overlappingReports.length,
  },
  excel,
  dashboard: dash,
  reconciliation,
  answers: {
    q1_firstDivergingKpi: {
      firstInFunnelOrder: firstStructural?.metric ?? firstNumeric?.metric,
      reason:
        "Gross Sales has no Excel counterpart — divergence starts before shared columns exist. First shared comparable break is Net Sales/Продажа (definition mismatch), then Revenue vs К перечислению (axis/coverage).",
      firstSharedNumericMismatch: firstNumeric?.metric,
      firstSharedNumericDiff: firstNumeric?.diff,
    },
    q2_cause: {
      primary: "different aggregation logic + wrong date axis (week report vs sale_date/operation_date)",
      detail: [
        "Gross/Returned/Net Sales KPIs are Dashboard commercial constructs; weekly Excel exposes Продажа (realized retail), not priceWithDisc gross/returns.",
        "Revenue: V4 uses Finance operation_date Σ ppvz_for_pay; Excel uses weekly report «К перечислению» — same economic family, different axis.",
        "Marketplace Fee: V4 Sales−forPay ≠ Excel implied Продажа−К.",
        "Logistics/Storage residuals: operation_date vs report week.",
        "Acceptance/Penalties historically near/match when coverage aligns.",
        "Net Profit vs Итого к оплате: different equations (not formula bug inside V4).",
        "wb_sales_reports count in DB: " +
          (reportsRes.data ?? []).length +
          " (overlapping " +
          overlappingReports.length +
          ") — Weekly Report dataset not available as parallel source in DB.",
      ],
      notPrimary: "wrong V4 tax formula / wrong V4 fee formula as such",
    },
    q3_weeklyReportsWouldEliminateDifference:
      overlappingReports.length === 0
        ? "Partially for Revenue/logistics/storage IF weekly report detail were synced into DB and used on the report-week axis — that would close the К перечислению / logistics gap toward Excel. It would NOT eliminate Gross/Returned/Net Sales gaps (Excel lacks those columns) nor make Итого к оплате equal V4 Net Profit (different equation). Currently account 1 has no usable wb_sales_reports rows overlapping this period."
        : "Weekly reports exist in DB; using report-week aggregation for Revenue/logistics/storage would reduce Excel gaps for those lines, but not Gross/Returned/display-Net or Net Profit↔Итого.",
  },
};

const outPath = resolve(
  "exports/excel-recon-WB-weekly-FINAL-2026-01-01_2026-07-19.json"
);
writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
console.log("Wrote", outPath);
