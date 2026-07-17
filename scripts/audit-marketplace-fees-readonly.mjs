#!/usr/bin/env node
/**
 * Read-only Marketplace Fees accounting audit (dashboard-equivalent scope).
 * Usage: npx tsx scripts/audit-marketplace-fees-readonly.mjs [accountId] [from] [to] [brandId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import { buildMarketplaceFeesPresentationFromFinance } from "../src/lib/finance-rollup.ts";
import {
  effectiveFinanceCategory,
  isMarketplaceFeeCategory,
  parseWbSourceSuffix,
} from "../src/lib/finance-category.ts";
import {
  fetchFinanceInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "../src/services/persisted-query-service.ts";
import { resolveScopedDateRange } from "../src/lib/marketplace-scope.ts";
import { getDefaultDateRange } from "../src/lib/utils.ts";
import { shareOfNetSalesPercent } from "../src/lib/profit-engine-model-b.ts";
import { resolveNetSalesFromSources } from "../src/lib/sales-revenue-resolution.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const MF_CATEGORIES = [
  "COMMISSION",
  "ACQUIRING",
  "PPVZ_REWARD",
  "PPVZ_VW",
  "OTHER",
  "ADJUSTMENT",
];

const CATEGORY_LABELS = {
  COMMISSION: "Commission",
  ACQUIRING: "Acquiring",
  PPVZ_REWARD: "PPVZ Reward",
  PPVZ_VW: "PPVZ VW",
  OTHER: "Other Marketplace Expenses",
  ADJUSTMENT: "Account Adjustments",
};

function fmt(n) {
  return n.toFixed(2);
}

async function auditScope(scope, label) {
  const client = createAdminClient();
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client);
  const productIds = products.map((p) => String(p.id));
  const finance = await fetchFinanceInRange(scope, client, { productIds });
  const sales = await fetchSalesInRange(scope, client, { productIds });
  const breakdown = assembleFinancialComponents({
    sales,
    finance,
    ads: [],
    costHistory: [],
  });
  const dashboard = buildMarketplaceFeesPresentationFromFinance(finance, breakdown.commission);
  const netSales = resolveNetSalesFromSources({
    sales,
    scopeFrom: scope.from,
    scopeTo: scope.to,
  });

  const byCategory = Object.fromEntries(MF_CATEGORIES.map((c) => [c, { amount: 0, rows: [] }]));
  const excluded = [];
  const duplicateKeys = new Map();
  let outOfRange = 0;

  for (const row of finance) {
    if (row.operation_date < scope.from || row.operation_date > scope.to) {
      outOfRange += 1;
    }

    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (suffix === "for_pay") {
      excluded.push({ row, reason: "for_pay excluded from marketplace fees" });
      continue;
    }

    const category = effectiveFinanceCategory(row);
    const key = row.source_key ?? row.id;
    duplicateKeys.set(key, (duplicateKeys.get(key) ?? 0) + 1);

    if (!isMarketplaceFeeCategory(category)) {
      excluded.push({ row, reason: `category ${category} not in marketplace fees` });
      continue;
    }

    if (category === "COMPENSATION") {
      excluded.push({ row, reason: "COMPENSATION (reimbursement) excluded" });
      continue;
    }

    if (MF_CATEGORIES.includes(category)) {
      byCategory[category].amount += Math.abs(Number(row.amount));
      byCategory[category].rows.push(row);
    }
  }

  const rawTotal = MF_CATEGORIES.reduce((s, c) => s + byCategory[c].amount, 0);
  const componentSum =
    dashboard.commission +
    dashboard.acquiring +
    dashboard.ppvzReward +
    dashboard.ppvzVw +
    dashboard.otherMarketplaceExpenses +
    dashboard.accountAdjustments;

  const dupCount = [...duplicateKeys.values()].filter((n) => n > 1).length;

  return {
    label,
    scope,
    productCount: products.length,
    financeRowCount: finance.length,
    dashboard,
    netSales,
    byCategory,
    rawTotal,
    componentSum,
    excluded,
    outOfRange,
    dupCount,
    mfPct: shareOfNetSalesPercent(netSales.netSales, dashboard.marketplaceFees),
  };
}

async function main() {
  loadEnv();
  const accountId = process.argv[2] ?? "1";
  const defaults = getDefaultDateRange();
  const from = process.argv[3] ?? defaults.from;
  const to = process.argv[4] ?? defaults.to;
  const brand = process.argv[5] ?? null;

  const scope = await resolveScopedDateRange({
    account: accountId,
    from,
    to,
    brand: brand ?? undefined,
  });

  const result = await auditScope(scope, "primary");

  console.log("=".repeat(72));
  console.log("MARKETPLACE FEES ACCOUNTING AUDIT (READ-ONLY)");
  console.log("=".repeat(72));
  console.log(`Company ID:           ${scope.companyId}`);
  console.log(`Marketplace Account:  ${scope.marketplaceAccountId}`);
  console.log(`Brand filter (URL):   ${scope.brandId ?? "none (all brands)"}`);
  console.log(`Date range:           ${scope.from} → ${scope.to}`);
  console.log(`Date field used:      operation_date (wb_finance.operation_date)`);
  console.log(`Products in scope:    ${result.productCount}`);
  console.log(`Finance rows loaded:  ${result.financeRowCount}`);
  console.log(`Note: Dashboard fetchProductsWithRelations does NOT apply brandId filter`);
  console.log("");

  console.log("--- Category Breakdown ---");
  console.log(
    "| Category              | Raw WB (₽) | Dashboard (₽) | Diff (₽) | Rows |"
  );
  console.log(
    "|-----------------------|-----------:|----------------:|---------:|-----:|"
  );

  const dashMap = {
    COMMISSION: result.dashboard.commission,
    ACQUIRING: result.dashboard.acquiring,
    PPVZ_REWARD: result.dashboard.ppvzReward,
    PPVZ_VW: result.dashboard.ppvzVw,
    OTHER: result.dashboard.otherMarketplaceExpenses,
    ADJUSTMENT: result.dashboard.accountAdjustments,
  };

  for (const cat of MF_CATEGORIES) {
    const raw = result.byCategory[cat].amount;
    const dash = dashMap[cat];
    const diff = raw - dash;
    const rows = result.byCategory[cat].rows.length;
    console.log(
      `| ${CATEGORY_LABELS[cat].padEnd(21)} | ${fmt(raw).padStart(9)} | ${fmt(dash).padStart(15)} | ${fmt(diff).padStart(8)} | ${String(rows).padStart(4)} |`
    );
  }

  console.log("");
  console.log("--- Totals ---");
  console.log(`Raw Total (row audit):     ${fmt(result.rawTotal)} ₽`);
  console.log(`Component Sum (dashboard): ${fmt(result.componentSum)} ₽`);
  console.log(`Dashboard Total:           ${fmt(result.dashboard.marketplaceFees)} ₽`);
  console.log(
    `Difference (Raw − Dashboard): ${fmt(result.rawTotal - result.dashboard.marketplaceFees)} ₽`
  );
  console.log(
    `Difference (Components − Dashboard): ${fmt(result.componentSum - result.dashboard.marketplaceFees)} ₽`
  );

  console.log("");
  console.log("--- Cross Check ---");
  const caseA = Math.abs(result.rawTotal - result.dashboard.marketplaceFees) < 0.01;
  console.log(`Case A (Raw = Dashboard): ${caseA ? "PROVEN ✓" : "NOT PROVEN"}`);

  console.log("");
  console.log("--- Percentage (Net Sales denominator) ---");
  console.log(`Net Sales:                 ${fmt(result.netSales.netSales)} ₽`);
  console.log(
    `MF % = MF ÷ Net Sales × 100 = ${fmt(result.dashboard.marketplaceFees)} ÷ ${fmt(result.netSales.netSales)} × 100 = ${result.mfPct.toFixed(2)}%`
  );

  console.log("");
  console.log("--- Validation ---");
  console.log(`Rows outside operation_date range: ${result.outOfRange}`);
  console.log(`Duplicate source_key count:        ${result.dupCount}`);
  console.log(`Excluded rows (non-MF):            ${result.excluded.length}`);

  const excludedByReason = {};
  for (const { reason } of result.excluded) {
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
  }
  console.log("Excluded breakdown:", excludedByReason);

  if (!caseA) {
    console.log("\n--- Discrepancy sample rows ---");
    for (const cat of MF_CATEGORIES) {
      if (Math.abs(result.byCategory[cat].amount - dashMap[cat]) > 0.01) {
        console.log(`Category ${cat} mismatch`);
      }
    }
  }

  // Scan common ranges for 280883 match
  if (process.argv.includes("--scan")) {
    console.log("\n--- Scanning ranges for 280883.00 ---");
    const candidates = [
      defaults,
      { from: "2026-05-24", to: "2026-06-23" },
      { from: "2026-06-08", to: "2026-07-05" },
      { from: "2026-05-01", to: "2026-07-12" },
      { from: "2026-04-01", to: "2026-07-12" },
    ];
    for (const r of candidates) {
      const s = await resolveScopedDateRange({ account: accountId, ...r });
      const res = await auditScope(s, "scan");
      const match = Math.abs(res.dashboard.marketplaceFees - 280883) < 1;
      console.log(
        `${r.from} → ${r.to}: ${fmt(res.dashboard.marketplaceFees)} ₽${match ? "  ← MATCHES 280,883" : ""}`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
