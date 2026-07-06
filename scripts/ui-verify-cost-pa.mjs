#!/usr/bin/env node
/** Sprint 5 UI verification helper — prints PA metrics for i8-80444 before/after cost import. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";
import {
  assertProductionValidationAllowed,
  getValidationAccountId,
  fetchAccountCostHistoryIds,
  cleanupCostHistorySnapshot,
} from "./lib/validation-isolation.mjs";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const ARTICLE = "i8-80444";
const accountId = getValidationAccountId(process.argv[2] ?? "2");
const phase = process.argv[3] ?? "before"; // before | import | after | cleanup
const newCostArg = process.argv[4]; // optional explicit new unit cost

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { getProductAnalytics } = await import("../src/services/product-analytics-service.ts");
const { bulkImportCostRecords } = await import("../src/services/cost-service.ts");
const { buildLatestCostByProductId } = await import("../src/lib/profit-calculator.ts");
const { fetchCostHistory } = await import("../src/services/dashboard-service.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

const scope = await resolveScopedDateRange({ account: accountId });
const supabase = createAdminClient();

async function fetchArticleMetrics(label) {
  const report = await getProductAnalytics(scope);
  const row = report?.v3All.find((r) => r.supplierArticle.trim() === ARTICLE);
  const { data: product } = await supabase
    .from("products")
    .select("id, supplier_article")
    .eq("marketplace_account_id", accountId)
    .eq("supplier_article", ARTICLE)
    .maybeSingle();

  let latestUnitCost = null;
  if (product) {
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, supplier_article")
      .eq("marketplace_account_id", accountId);
    const costHistory = await fetchCostHistory(accountId);
    const latest = buildLatestCostByProductId(
      costHistory,
      (allProducts ?? []).map((p) => ({
        id: String(p.id),
        supplier_article: p.supplier_article,
      }))
    );
    latestUnitCost = latest.get(String(product.id)) ?? null;

    const { data: historyTop } = await supabase
      .from("product_cost_history")
      .select("cost, effective_from, created_at")
      .eq("product_id", product.id)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3);
    console.log(`\n=== ${label} ===`);
    console.log("Period:", scope.from, "→", scope.to);
    console.log("Account:", accountId);
    console.log("Supplier article:", ARTICLE);
    console.log("Product ID:", product.id);
    console.log("product_cost_history (top 3):", historyTop);
    console.log("PA latest unit cost (buildLatestCostByProductId):", latestUnitCost);
    if (row) {
      console.log("PA Product Cost (total COGS):", row.productCost);
      console.log("PA Revenue:", row.revenue);
      console.log("PA Operational Profit:", row.operationalProfit);
      console.log("PA Purchases (units):", row.purchases);
    } else {
      console.log("PA row: NOT FOUND in v3All (no activity in period?)");
    }
    return { row, latestUnitCost, productId: String(product.id), historyTop };
  }

  console.log(`\n=== ${label} ===`);
  console.log("Product not found for", ARTICLE);
  return { row: null, latestUnitCost: null, productId: null, historyTop: null };
}

const outDir = resolve(process.cwd(), "scripts/.ui-verify-output");
const snapshotPath = resolve(outDir, "cost-history-ids-before.json");
mkdirSync(outDir, { recursive: true });

if (phase === "before") {
  assertProductionValidationAllowed(accountId);
  const metrics = await fetchArticleMetrics("BEFORE import");
  writeFileSync(resolve(outDir, "before.json"), JSON.stringify(metrics, null, 2));
  process.exit(0);
}

if (phase === "import") {
  assertProductionValidationAllowed(accountId);
  const beforeIds = [...(await fetchAccountCostHistoryIds(supabase, accountId))];
  writeFileSync(snapshotPath, JSON.stringify(beforeIds, null, 2));

  const before = JSON.parse(readFileSync(resolve(outDir, "before.json"), "utf8"));
  const currentUnit = before.latestUnitCost ?? 1100;
  const newCost = newCostArg ? Number(newCostArg) : currentUnit + 100;

  const xlsxPath = resolve(outDir, "cost-import-i8-80444.xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([{ "Supplier Article": ARTICLE, "Unit Cost": newCost }]),
    "Costs"
  );
  writeFileSync(xlsxPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  const { parseCostExcel } = await import("../src/lib/cost-excel.ts");
  const buf = readFileSync(xlsxPath);
  const result = await bulkImportCostRecords(parseCostExcel(buf.buffer), accountId);

  console.log("\n=== IMPORT ===");
  console.log("File:", xlsxPath);
  console.log("New unit cost:", newCost);
  console.log("Import result:", result);
  writeFileSync(
    resolve(outDir, "import.json"),
    JSON.stringify({ newCost, result, xlsxPath }, null, 2)
  );
  process.exit(0);
}

if (phase === "after") {
  const before = JSON.parse(readFileSync(resolve(outDir, "before.json"), "utf8"));
  const imp = JSON.parse(readFileSync(resolve(outDir, "import.json"), "utf8"));
  const after = await fetchArticleMetrics("AFTER import");

  writeFileSync(resolve(outDir, "after.json"), JSON.stringify(after, null, 2));

  const productCostBefore = before.row?.productCost ?? 0;
  const productCostAfter = after.row?.productCost ?? 0;
  const profitBefore = before.row?.operationalProfit ?? 0;
  const profitAfter = after.row?.operationalProfit ?? 0;
  const unitBefore = before.latestUnitCost ?? 0;
  const unitAfter = after.latestUnitCost ?? 0;

  console.log("\n=== COMPARISON ===");
  console.log("Unit cost (PA path):", unitBefore, "→", unitAfter, "(expected", imp.newCost + ")");
  console.log("Product Cost column:", productCostBefore, "→", productCostAfter);
  console.log("Operational Profit:", profitBefore, "→", profitAfter);

  const historyOk = after.historyTop?.[0]?.cost === imp.newCost;
  const unitOk = unitAfter === imp.newCost;
  const productCostNonZero = (after.row?.productCost ?? 0) > 0;
  const productCostChanged =
    productCostBefore !== productCostAfter || imp.newCost !== unitBefore;
  const profitChanged = profitBefore !== profitAfter;

  const pass =
    historyOk &&
    unitOk &&
    productCostNonZero &&
    productCostChanged &&
    profitChanged;

  console.log("\n=== RESULT ===");
  console.log(historyOk ? "PASS" : "FAIL", "product_cost_history has new unit cost");
  console.log(unitOk ? "PASS" : "FAIL", "PA latest unit cost matches import");
  console.log(productCostNonZero ? "PASS" : "FAIL", "Product Cost column is NOT zero");
  console.log(productCostChanged ? "PASS" : "FAIL", "Product Cost changed after import");
  console.log(profitChanged ? "PASS" : "FAIL", "Operational Profit changed accordingly");
  console.log("\n" + (pass ? "PASS" : "FAIL"));

  // Always remove validation import rows after verification.
  if (existsSync(snapshotPath)) {
    const beforeIds = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const result = await cleanupCostHistorySnapshot(supabase, accountId, beforeIds);
    console.log(`[validation-cleanup] removed ${result.deleted} cost history row(s) from account ${accountId}`);
  }

  process.exit(pass ? 0 : 1);
}

if (phase === "cleanup") {
  assertProductionValidationAllowed(accountId);
  if (existsSync(snapshotPath)) {
    const beforeIds = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const result = await cleanupCostHistorySnapshot(supabase, accountId, beforeIds);
    console.log(`[validation-cleanup] removed ${result.deleted} cost history row(s) from account ${accountId}`);
  } else {
    console.log("No snapshot found — nothing to clean up.");
  }
  process.exit(0);
}

console.error("Usage: ui-verify-cost-pa.mjs [accountId] before|import|after|cleanup [newCost]");
process.exit(1);
