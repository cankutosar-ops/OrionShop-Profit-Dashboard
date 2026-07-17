#!/usr/bin/env node
/**
 * Sprint — Complete Historical Finance Verification (All Accounts)
 * Usage: npx tsx scripts/verify-finance-historical-sprint.mjs [accountId]
 * Without accountId: runs both accounts + writes exports/finance-backfill/sprint-verification.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { parseWbSourceSuffix } from "../src/lib/finance-category.ts";
import { summarizeFinanceByCategory } from "../src/lib/finance-rollup.ts";
import {
  buildMarketplaceFeesPresentationFromFinance,
} from "../src/lib/finance-rollup.ts";
import { buildModelCProfitMetrics } from "../src/lib/profit-engine-model-c.ts";
import { buildModelBProfitMetrics } from "../src/lib/profit-engine-model-b.ts";
import { buildWbSettlementFromSources, resolveNetForPay, sumNetForPayFromFinance } from "../src/lib/wb-settlement.ts";
import { buildInclusiveDateRange } from "../src/lib/utils.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { mapFinanceRowsFromReport } from "../src/lib/wildberries/mappers.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const FROM = "2026-01-01";
const TO = new Date().toISOString().slice(0, 10);

const REPORT_CATEGORIES = [
  "for_pay",
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
];

function suffixToReportCategory(suffix) {
  switch (suffix) {
    case "commission": return "Commission";
    case "acquiring_fee": return "Acquiring";
    case "ppvz_reward": return "PPVZ Reward";
    case "ppvz_vw": return "PPVZ VW";
    case "logistics":
    case "oper_logistics": return "Logistics";
    case "return_logistics":
    case "oper_return_logistics": return "Return Logistics";
    case "storage":
    case "oper_storage": return "Storage";
    case "penalty":
    case "oper_penalty": return "Penalties";
    case "deduction": return "Deductions";
    case "acceptance": return "Acceptance";
    case "additional_payment": return "Compensation";
    case "for_pay": return "for_pay";
    default: return "Other Marketplace Expenses";
  }
}

function aggregateReportCategories(rows) {
  const out = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c, 0]));
  for (const row of rows) {
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix ?? null) || "unknown";
    const cat = suffixToReportCategory(suffix);
    out[cat] = (out[cat] ?? 0) + 1;
  }
  return out;
}

function apiRowsToCategoryCounts(apiRows) {
  const counts = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c, 0]));
  for (const row of apiRows) {
    const lines = mapFinanceRowsFromReport(row, null);
    for (const line of lines) {
      const cat = suffixToReportCategory(line.wb_source_suffix ?? "unknown");
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
  }
  return counts;
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

function computeKpis(finance) {
  const netForPay = sumNetForPayFromFinance(finance);
  const categorySummary = summarizeFinanceByCategory(finance);
  const presentation = buildMarketplaceFeesPresentationFromFinance(finance, categorySummary.COMMISSION ?? 0);
  const totalLogistics = (categorySummary.LOGISTICS ?? 0) + (categorySummary.RETURN_LOGISTICS ?? 0);

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

  const settlement = buildWbSettlementFromSources(
    finance,
    totalLogistics,
    resolveNetForPay(finance)
  );

  return {
    modelB: {
      marketplaceFees: presentation.marketplaceFees,
      logistics: categorySummary.LOGISTICS ?? 0,
      returnLogistics: categorySummary.RETURN_LOGISTICS ?? 0,
      storage: categorySummary.STORAGE ?? 0,
      penalties: categorySummary.PENALTY ?? 0,
      accountAdjustments: presentation.accountAdjustments,
    },
    modelC: {
      revenue: modelC.revenue,
      marketplaceFees: modelC.marketplaceFees,
      logistics: modelC.logistics,
      storage: modelC.storage,
      penalties: modelC.penalties,
      deductions: modelC.deductions,
      wbSettlement: settlement.settlement,
      netProfit: modelC.netProfit,
    },
  };
}

const MONTHS = [
  { label: "2026-01", from: "2026-01-01", to: "2026-01-31" },
  { label: "2026-02", from: "2026-02-01", to: "2026-02-28" },
  { label: "2026-03", from: "2026-03-01", to: "2026-03-31" },
  { label: "2026-04", from: "2026-04-01", to: "2026-04-30" },
  { label: "2026-05", from: "2026-05-01", to: "2026-05-31" },
  { label: "2026-06", from: "2026-06-01", to: "2026-06-30" },
  { label: "2026-07", from: "2026-07-01", to: TO },
];

async function apiVsDbMonthCheck(client, db, accountId, month) {
  let apiRows = [];
  try {
    apiRows = await client.fetchFinanceReport(month.from, month.to);
  } catch (err) {
    return { month: month.label, error: err instanceof Error ? err.message : String(err) };
  }
  const dbRows = await fetchAllFinance(db, accountId, month.from, month.to);
  const apiCats = apiRowsToCategoryCounts(apiRows);
  const dbCats = aggregateReportCategories(dbRows);

  const gaps = [];
  for (const cat of REPORT_CATEGORIES) {
    const apiCount = apiCats[cat] ?? 0;
    const dbCount = dbCats[cat] ?? 0;
    if (apiCount > 0 && dbCount === 0) {
      gaps.push({ category: cat, apiRows: apiCount, dbRows: 0, status: "MISSING_IN_DB" });
    } else if (dbCount < apiCount * 0.9 && apiCount > 10) {
      gaps.push({ category: cat, apiRows: apiCount, dbRows: dbCount, status: "UNDERCOVERAGE" });
    }
  }

  return {
    month: month.label,
    apiReportRows: apiRows.length,
    dbFinanceRows: dbRows.length,
    apiCategories: apiCats,
    dbCategories: dbCats,
    gaps,
    complete: gaps.length === 0,
  };
}

function compareCategoryTables(before, after) {
  return REPORT_CATEGORIES.map((cat) => ({
    Category: cat,
    Before: before[cat] ?? 0,
    After: after[cat] ?? 0,
    "New Rows": (after[cat] ?? 0) - (before[cat] ?? 0),
    Status:
      (after[cat] ?? 0) >= (before[cat] ?? 0)
        ? (before[cat] === 0 && (after[cat] ?? 0) > 0 ? "BACKFILLED" : "OK")
        : "REGRESSION",
  }));
}

function loadPreAudit(accountId) {
  const path = resolve(`exports/finance-backfill/account${accountId}-pre-audit.json`);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(raw.slice(jsonStart));
  } catch {
    return null;
  }
}

async function verifyAccount(db, accountId, accountName, options = {}) {
  const { skipApiCheck = false } = options;
  const finance = await fetchAllFinance(db, accountId, FROM, TO);
  const currentCategories = aggregateReportCategories(finance);
  const preAudit = loadPreAudit(accountId);
  const preCategories = preAudit?.reportCategories ?? null;

  const categoryComparison = preCategories
    ? compareCategoryTables(preCategories, currentCategories)
    : REPORT_CATEGORIES.map((cat) => ({
        Category: cat,
        Before: "—",
        After: currentCategories[cat] ?? 0,
        "New Rows": "—",
        Status: (currentCategories[cat] ?? 0) > 0 ? "PRESENT" : "EMPTY",
      }));

  const range90 = buildInclusiveDateRange(90);
  const finance90 = finance.filter(
    (r) => r.operation_date >= range90.from && r.operation_date <= range90.to
  );
  const kpisNow = computeKpis(finance90);
  const kpisBefore = preAudit?.kpis90d
    ? {
        modelC: {
          revenue: preAudit.kpis90d.modelCRevenue,
          marketplaceFees: preAudit.kpis90d.marketplaceFees,
          logistics: preAudit.kpis90d.logistics,
          storage: preAudit.kpis90d.storage,
          penalties: preAudit.kpis90d.penalties,
          deductions: preAudit.kpis90d.deductions,
          wbSettlement: preAudit.kpis90d.wbSettlement,
          netProfit: preAudit.kpis90d.modelCNetProfit,
        },
        modelB: {
          marketplaceFees: preAudit.kpis90d.marketplaceFees,
          logistics: preAudit.kpis90d.logistics,
          returnLogistics: preAudit.kpis90d.returnLogistics,
          storage: preAudit.kpis90d.storage,
          penalties: preAudit.kpis90d.penalties,
          accountAdjustments: preAudit.kpis90d.accountAdjustments,
        },
      }
    : null;

  let apiChecks = [];
  if (!skipApiCheck) {
    try {
      const account = await getMarketplaceAccountForSync(accountId);
      const client = new WbApiClient(account.apiKey);
      for (const month of MONTHS) {
        if (month.from > TO) continue;
        apiChecks.push(await apiVsDbMonthCheck(client, db, accountId, month));
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      apiChecks = [{ error: err instanceof Error ? err.message : String(err) }];
    }
  }

  const monthlyForPay = {};
  for (const m of MONTHS) {
    if (m.from > TO) continue;
    const monthRows = finance.filter((r) => r.operation_date >= m.from && r.operation_date <= m.to);
    monthlyForPay[m.label] = aggregateReportCategories(monthRows).for_pay;
  }

  const forPayComplete = MONTHS.every((m) => m.from > TO || (monthlyForPay[m.label] ?? 0) > 0);
  const allCategoriesComplete =
    apiChecks.length > 0 &&
    !apiChecks.some((c) => c.gaps?.length > 0) &&
    (currentCategories.for_pay ?? 0) > 0 &&
    (currentCategories.Commission ?? 0) > 0;

  const apiGapMonths = apiChecks.filter((c) => c.gaps?.length > 0).map((c) => c.month);

  return {
    accountId,
    accountName,
    period: { from: FROM, to: TO },
    totalFinanceRows: finance.length,
    reportCategories: currentCategories,
    categoryComparison,
    monthlyForPay,
    kpis90d: { before: kpisBefore, after: kpisNow },
    apiVsDbChecks: apiChecks,
    apiGapMonths,
    status: {
      forPayComplete: forPayComplete && (currentCategories.for_pay ?? 0) > 0,
      allCategoriesComplete,
      historicalFinanceComplete: apiGapMonths.length === 0 && forPayComplete,
      overall:
        apiGapMonths.length === 0 && (currentCategories.for_pay ?? 0) > 0
          ? "COMPLETE"
          : apiGapMonths.length > 0
            ? "GAPS_REMAINING"
            : (currentCategories.for_pay ?? 0) === 0
              ? "NEEDS_BACKFILL"
              : "PARTIAL",
    },
  };
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const skipApiCheck = process.argv.includes("--skip-api");
  const db = createAdminClient();
  const targetId = args[0];

  const { data: accounts } = await db
    .from("marketplace_accounts")
    .select("id, name, store_name")
    .order("created_at");

  const list = targetId
    ? (accounts ?? []).filter((a) => String(a.id) === String(targetId))
    : accounts ?? [];

  if (!list.length) {
    console.error("No marketplace accounts found");
    process.exit(1);
  }

  const results = [];
  for (const acc of list) {
    const name = acc.store_name ?? acc.name ?? acc.id;
    console.log(`\n=== Verifying ${name} (Account ${acc.id}) ===`);
    const result = await verifyAccount(db, acc.id, name, {
      skipApiCheck,
    });
    results.push(result);

    console.log("\nCategory comparison:");
    console.table(result.categoryComparison);

    console.log("\nMonthly for_pay:");
    console.table(
      Object.entries(result.monthlyForPay).map(([Month, for_pay]) => ({ Month, for_pay }))
    );

    if (result.kpis90d.before) {
      console.log("\nModel C KPI 90d BEFORE vs AFTER:");
      const b = result.kpis90d.before.modelC;
      const a = result.kpis90d.after.modelC;
      console.table([
        { KPI: "Revenue (netForPay)", Before: b.revenue, After: a.revenue, Delta: a.revenue - b.revenue },
        { KPI: "Marketplace Fees", Before: b.marketplaceFees, After: a.marketplaceFees, Delta: a.marketplaceFees - b.marketplaceFees },
        { KPI: "Logistics", Before: b.logistics, After: a.logistics, Delta: a.logistics - b.logistics },
        { KPI: "Storage", Before: b.storage, After: a.storage, Delta: a.storage - b.storage },
        { KPI: "Penalties", Before: b.penalties, After: a.penalties, Delta: a.penalties - b.penalties },
        { KPI: "Deductions", Before: b.deductions, After: a.deductions, Delta: a.deductions - b.deductions },
        { KPI: "WB Settlement", Before: b.wbSettlement, After: a.wbSettlement, Delta: a.wbSettlement - b.wbSettlement },
        { KPI: "Net Profit (Model C)", Before: b.netProfit, After: a.netProfit, Delta: a.netProfit - b.netProfit },
      ]);
    }

    console.log("\nFinal status:", result.status);
    if (result.apiGapMonths.length) {
      console.log("API gap months:", result.apiGapMonths.join(", "));
    }
  }

  const outDir = resolve("exports/finance-backfill");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "sprint-verification.json"), JSON.stringify(results, null, 2));

  console.log("\n=== Summary Table ===");
  console.table(
    results.map((r) => ({
      Account: r.accountName,
      "for_pay Complete": r.status.forPayComplete ? "YES" : "NO",
      "All Categories": r.status.allCategoriesComplete ? "YES" : "NO",
      "Historical Complete": r.status.historicalFinanceComplete ? "YES" : "NO",
      Status: r.status.overall,
    }))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
