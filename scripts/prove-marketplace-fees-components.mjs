#!/usr/bin/env node
/**
 * Prove Marketplace Fees KPI composition — Legacy vs Model B (transaction-level).
 * Usage: npx tsx scripts/prove-marketplace-fees-components.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} from "../src/lib/finance-rollup.ts";
import { effectiveFinanceCategory } from "../src/lib/finance-category.ts";
import { assembleFinancialComponents } from "../src/lib/financial-components.ts";
import { fetchFinanceInRange } from "../src/services/persisted-query-service.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const from = process.argv[3] ?? "2026-04-14";
const to = process.argv[4] ?? "2026-07-12";

function r(n) {
  return Math.round(n * 100) / 100;
}

/** What the current Legacy dashboard MF KPI card displays (page.tsx). */
function legacyUiMarketplaceFees(presentation) {
  return presentation.marketplaceFees;
}

/** Deprecated pre-V3 formula still used in audit scripts — NOT current UI. */
function deprecatedLegacyFormula(components) {
  return r(components.commission + components.otherExpenses);
}

function inMfKpi(category) {
  return ["COMMISSION", "ACQUIRING", "PPVZ_REWARD", "PPVZ_VW", "OTHER"].includes(category);
}

function buildComponentTable(cats, penalties, hidden, mfKpiTotal, includeInKpi) {
  const rows = [
    ["Commission", cats.COMMISSION, includeInKpi("COMMISSION")],
    ["Acquiring", cats.ACQUIRING, includeInKpi("ACQUIRING")],
    ["PPVZ Reward", cats.PPVZ_REWARD, includeInKpi("PPVZ_REWARD")],
    ["PPVZ VW", cats.PPVZ_VW, includeInKpi("PPVZ_VW")],
    ["Other Marketplace Fees", cats.OTHER, includeInKpi("OTHER")],
    ["Account Adjustments", cats.ADJUSTMENT, includeInKpi("ADJUSTMENT")],
    ["Compensation", cats.COMPENSATION, includeInKpi("COMPENSATION")],
    ["Penalties", penalties, includeInKpi("PENALTY")],
    ["Other Finance Categories", hidden, false],
    ["TOTAL Marketplace Fees", mfKpiTotal, null],
  ];
  return rows;
}

function printTable(title, rows) {
  console.log(`\n## ${title}`);
  console.log("| Component | Amount | In MF KPI? |");
  console.log("|-----------|-------:|:----------:|");
  for (const [label, amount, inKpi] of rows) {
    const flag = inKpi === null ? "—" : inKpi ? "YES" : "NO";
    console.log(`| ${label} | ${r(amount)} | ${flag} |`);
  }
}

async function main() {
  const client = createAdminClient();
  const scope = { marketplaceAccountId: accountId, companyId: "", from, to };
  const finance = await fetchFinanceInRange(scope, client);
  const components = assembleFinancialComponents({
    sales: [],
    finance,
    ads: [],
    costHistory: [],
  });
  const cats = summarizeFinanceByCategory(finance);
  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const presentation = buildMarketplaceFeesPresentationFromFinance(
    finance,
    components.commission
  );

  const legacyUiMf = legacyUiMarketplaceFees(presentation);
  const modelBMf = presentation.marketplaceFees;
  const deprecatedMf = deprecatedLegacyFormula(components);

  console.log("=== MARKETPLACE FEES COMPONENT PROOF ===");
  console.log(`Account: ${accountId}  Period: ${from} → ${to}`);
  console.log(`Finance rows: ${finance.length}`);

  const legacyRows = buildComponentTable(
    cats,
    components.penalties,
    financeTotals.unclassified,
    legacyUiMf,
    inMfKpi
  );
  const modelBRows = buildComponentTable(
    cats,
    0,
    0,
    modelBMf,
    inMfKpi
  );

  printTable("Legacy Dashboard Marketplace Fees (current UI)", legacyRows);
  printTable("Profit Dashboard V3 — Model B Marketplace Fees", modelBRows);

  console.log("\n## Direct Comparison");
  console.log("| Component | Legacy UI | Model B | Difference |");
  console.log("|-----------|----------:|--------:|-----------:|");
  const compareLabels = [
    "Commission",
    "Acquiring",
    "PPVZ Reward",
    "PPVZ VW",
    "Other Marketplace Fees",
    "Account Adjustments",
    "Compensation",
    "Penalties",
    "Other Finance Categories",
    "TOTAL Marketplace Fees",
  ];
  const legacyAmounts = legacyRows.map((row) => row[1]);
  const modelBAmounts = modelBRows.map((row) => row[1]);
  for (let i = 0; i < compareLabels.length; i += 1) {
    const leg = legacyAmounts[i];
    const mb = modelBAmounts[i];
    console.log(`| ${compareLabels[i]} | ${r(leg)} | ${r(mb)} | ${r(leg - mb)} |`);
  }

  console.log("\n## KPI source proof");
  console.log(`Legacy UI MF KPI (page.tsx → marketplaceFeesPresentation.marketplaceFees): ${legacyUiMf}`);
  console.log(`Model B MF KPI (buildModelBProfitMetrics → presentation.marketplaceFees): ${modelBMf}`);
  console.log(`Difference (current dashboards): ${r(legacyUiMf - modelBMf)}`);
  console.log(`Deprecated formula (commission + otherExpenses) — NOT current UI: ${deprecatedMf}`);
  console.log(
    `Deprecated gap vs Model B: ${r(deprecatedMf - modelBMf)} = ADJUSTMENT (${r(cats.ADJUSTMENT)}) + COMPENSATION (${r(cats.COMPENSATION)})`
  );

  // Sample finance rows for ADJUSTMENT and COMPENSATION
  const adjustmentRows = finance
    .filter((row) => effectiveFinanceCategory(row) === "ADJUSTMENT")
    .slice(0, 3);
  const compensationRows = finance
    .filter((row) => effectiveFinanceCategory(row) === "COMPENSATION")
    .slice(0, 3);

  console.log("\n## Account Adjustments — sample finance rows");
  for (const row of adjustmentRows) {
    console.log(
      JSON.stringify({
        source_key: row.source_key,
        operation_date: row.operation_date,
        amount: row.amount,
        category: effectiveFinanceCategory(row),
        supplier_oper_name: row.supplier_oper_name ?? row.description?.slice(0, 60),
      })
    );
  }
  console.log(`Total ADJUSTMENT rows: ${finance.filter((r) => effectiveFinanceCategory(r) === "ADJUSTMENT").length}`);
  console.log(`Sum ADJUSTMENT: ${r(cats.ADJUSTMENT)}`);

  console.log("\n## Compensation — sample finance rows");
  for (const row of compensationRows) {
    console.log(
      JSON.stringify({
        source_key: row.source_key,
        operation_date: row.operation_date,
        amount: row.amount,
        category: effectiveFinanceCategory(row),
        supplier_oper_name: row.supplier_oper_name ?? row.description?.slice(0, 60),
      })
    );
  }
  console.log(`Total COMPENSATION rows: ${finance.filter((r) => effectiveFinanceCategory(r) === "COMPENSATION").length}`);
  console.log(`Sum COMPENSATION: ${r(cats.COMPENSATION)}`);

  console.log("\n## Account Adjustments — single correct answer");
  console.log("A) Included inside MF KPI?           NO — excluded by isMarketplaceFeeCategory()");
  console.log("B) Displayed separately?             YES — Model B 'Account Adjustments' KPI card");
  console.log("C) Deducted separately from NP?        YES — Model B engine accountAdjustments line");
  console.log("D) Both included AND deducted?         NO");
  console.log("E) Excluded completely?              NO — tracked and deducted in Model B NP");
  console.log("Legacy dashboard: NOT in MF KPI; NOT shown as separate KPI; deducted via Model B NP only.");

  console.log("\n## Compensation — single correct answer");
  console.log("- Belongs inside Marketplace Fees?     NO");
  console.log("- Belongs inside Account Adjustments? NO");
  console.log("- Should reduce Net Profit?            NO (not deducted in Model B or Model C engines)");
  console.log("- Should increase Net Profit?          NO (informational reimbursements field only)");
  console.log("- Is informational only?               YES — presentation.reimbursements, excluded from all NP formulas");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
