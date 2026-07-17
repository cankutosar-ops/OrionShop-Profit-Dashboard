#!/usr/bin/env node
/**
 * Complete finance dataset validation by suffix/category for all accounts.
 * Usage: npx tsx scripts/audit-finance-completeness.mjs [accountId] [from] [to]
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { parseWbSourceSuffix } from "../src/lib/finance-category.ts";
import { summarizeFinanceByCategory } from "../src/lib/finance-rollup.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";
import { buildModelBProfitMetrics } from "../src/lib/profit-engine-model-b.ts";
import { buildWbSettlementMetrics } from "../src/lib/wb-settlement.ts";
import { buildMarketplaceFeesPresentationFromFinance } from "../src/lib/finance-rollup.ts";
import { sumNetForPayFromFinance } from "../src/lib/wb-settlement.ts";
import { buildInclusiveDateRange } from "../src/lib/utils.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const CATEGORY_LABELS = {
  commission: "Commission",
  acquiring_fee: "Acquiring",
  ppvz_reward: "PPVZ Reward",
  ppvz_vw: "PPVZ VW",
  logistics: "Logistics",
  oper_logistics: "Logistics (oper)",
  return_logistics: "Return Logistics",
  oper_return_logistics: "Return Logistics (oper)",
  storage: "Storage",
  oper_storage: "Storage (oper)",
  penalty: "Penalties",
  oper_penalty: "Penalties (oper)",
  deduction: "Deductions / Adjustments",
  acceptance: "Acceptance",
  additional_payment: "Compensation",
  for_pay: "for_pay",
  other: "Other (unmapped suffix)",
};

const REPORT_CATEGORIES = [
  "Commission",
  "Acquiring",
  "PPVZ Reward",
  "PPVZ VW",
  "Logistics",
  "Return Logistics",
  "Storage",
  "Penalties",
  "Deductions",
  "Acceptance",
  "Compensation",
  "Other Marketplace Expenses",
  "for_pay",
];

function suffixToReportCategory(suffix) {
  switch (suffix) {
    case "commission":
      return "Commission";
    case "acquiring_fee":
      return "Acquiring";
    case "ppvz_reward":
      return "PPVZ Reward";
    case "ppvz_vw":
      return "PPVZ VW";
    case "logistics":
    case "oper_logistics":
      return "Logistics";
    case "return_logistics":
    case "oper_return_logistics":
      return "Return Logistics";
    case "storage":
    case "oper_storage":
      return "Storage";
    case "penalty":
    case "oper_penalty":
      return "Penalties";
    case "deduction":
      return "Deductions";
    case "acceptance":
      return "Acceptance";
    case "additional_payment":
      return "Compensation";
    case "for_pay":
      return "for_pay";
    default:
      return "Other Marketplace Expenses";
  }
}

async function fetchAllFinance(db, accountId, from, to) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("wb_finance")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

function countBySuffix(rows) {
  const counts = {};
  const amounts = {};
  for (const row of rows) {
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix ?? null) || "unknown";
    counts[suffix] = (counts[suffix] ?? 0) + 1;
    amounts[suffix] = (amounts[suffix] ?? 0) + Math.abs(Number(row.amount ?? 0));
  }
  return { counts, amounts };
}

function aggregateReportCategories(suffixCounts) {
  const out = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c, 0]));
  for (const [suffix, count] of Object.entries(suffixCounts)) {
    const cat = suffixToReportCategory(suffix);
    out[cat] = (out[cat] ?? 0) + count;
  }
  return out;
}

function earliestSuffixDate(rows, suffixes) {
  const set = new Set(suffixes);
  const dates = rows
    .filter((r) => set.has(parseWbSourceSuffix(r.source_key, r.wb_source_suffix ?? null)))
    .map((r) => String(r.operation_date).slice(0, 10))
    .sort();
  return dates[0] ?? null;
}

function computeDashboardKpis(finance, salesForLogistics = 0) {
  const netForPay = sumNetForPayFromFinance(finance);
  const categorySummary = summarizeFinanceByCategory(finance);
  const presentation = buildMarketplaceFeesPresentationFromFinance(finance, categorySummary.COMMISSION);
  const totalLogistics =
    (categorySummary.LOGISTICS ?? 0) + (categorySummary.RETURN_LOGISTICS ?? 0);

  const modelC = buildModelCProfitMetrics({
    netForPay,
    marketplaceFees: presentation.marketplaceFees,
    logistics: totalLogistics,
    storage: categorySummary.STORAGE ?? 0,
    penalties: categorySummary.PENALTY ?? 0,
    deductions: categorySummary.ADJUSTMENT ?? 0,
    acceptance: 0,
    productCost: 0,
    advertising: 0,
  });

  const settlement = buildWbSettlementMetrics({
    netForPay,
    finance,
    logistics: totalLogistics,
    dataSource: "finance_transaction",
  });

  return {
    modelCRevenue: modelC.revenue,
    marketplaceFees: presentation.marketplaceFees,
    accountAdjustments: presentation.accountAdjustments,
    logistics: categorySummary.LOGISTICS ?? 0,
    returnLogistics: categorySummary.RETURN_LOGISTICS ?? 0,
    storage: categorySummary.STORAGE ?? 0,
    penalties: categorySummary.PENALTY ?? 0,
    deductions: categorySummary.ADJUSTMENT ?? 0,
    compensation: categorySummary.COMPENSATION ?? 0,
    wbSettlement: settlement.settlement,
    modelCNetProfit: modelC.netProfit,
    forPayRows: aggregateReportCategories(countBySuffix(finance).counts).for_pay,
  };
}

async function auditAccount(db, accountId, from, to) {
  const { data: account } = await db
    .from("marketplace_accounts")
    .select("id, name, store_name")
    .eq("id", accountId)
    .maybeSingle();

  const finance = await fetchAllFinance(db, accountId, from, to);
  const { counts, amounts } = countBySuffix(finance);
  const byCategory = aggregateReportCategories(counts);

  const months = [
    ["2026-01", "2026-01-01", "2026-01-31"],
    ["2026-02", "2026-02-01", "2026-02-28"],
    ["2026-03", "2026-03-01", "2026-03-31"],
    ["2026-04", "2026-04-01", "2026-04-30"],
    ["2026-05", "2026-05-01", "2026-05-31"],
    ["2026-06", "2026-06-01", "2026-06-30"],
    ["2026-07", "2026-07-01", to],
  ];

  const monthlyForPay = {};
  for (const [label, mFrom, mTo] of months) {
    if (mFrom > to) continue;
    const monthRows = finance.filter(
      (r) => r.operation_date >= mFrom && r.operation_date <= mTo
    );
    monthlyForPay[label] = aggregateReportCategories(countBySuffix(monthRows).counts).for_pay;
  }

  const range90 = buildInclusiveDateRange(90);
  const finance90 = finance.filter(
    (r) => r.operation_date >= range90.from && r.operation_date <= range90.to
  );

  return {
    accountId,
    accountName: account?.store_name ?? account?.name ?? accountId,
    period: { from, to },
    totalFinanceRows: finance.length,
    suffixCounts: counts,
    suffixAmounts: amounts,
    reportCategories: byCategory,
    earliestForPay: earliestSuffixDate(finance, ["for_pay"]),
    earliestCommission: earliestSuffixDate(finance, ["commission"]),
    monthlyForPay,
    hasJanFinance: finance.some((r) => r.operation_date >= "2026-01-01" && r.operation_date <= "2026-01-31"),
    kpis90d: computeDashboardKpis(finance90),
    kpis30d: computeDashboardKpis(
      finance.filter(
        (r) =>
          r.operation_date >= buildInclusiveDateRange(30).from &&
          r.operation_date <= buildInclusiveDateRange(30).to
      )
    ),
  };
}

async function main() {
  loadEnv();
  const accountId = process.argv[2];
  const from = process.argv[3] ?? "2026-01-01";
  const to = process.argv[4] ?? new Date().toISOString().slice(0, 10);
  const db = createAdminClient();

  if (accountId) {
    const result = await auditAccount(db, accountId, from, to);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { data: accounts } = await db
    .from("marketplace_accounts")
    .select("id, name, store_name")
    .order("created_at");

  const results = [];
  for (const acc of accounts ?? []) {
    results.push(await auditAccount(db, acc.id, from, to));
  }

  const outDir = resolve("exports/finance-backfill");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "completeness-audit.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
