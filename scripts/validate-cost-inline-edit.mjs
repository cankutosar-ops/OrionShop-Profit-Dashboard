#!/usr/bin/env node
/** Verify Sprint 5.1 inline cost edit + bulk import unchanged. */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createValidationSession, getValidationAccountId, assertProductionValidationAllowed } from "./lib/validation-isolation.mjs";

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
assertProductionValidationAllowed(accountId);

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { updateProductPurchaseCost, bulkImportCostRecords, buildCostTemplateRows } =
  await import("../src/services/cost-service.ts");
const { buildLatestCostByProductId } = await import("../src/lib/profit-calculator.ts");
const { fetchCostHistory, getProductProfitability } = await import(
  "../src/services/dashboard-service.ts"
);
const { parseCostExcel, buildCostTemplateWorkbook } = await import("../src/lib/cost-excel.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

const scope = await resolveScopedDateRange({ account: accountId });
const supabase = createAdminClient();
const session = createValidationSession(supabase, accountId);
await session.begin();

let exitCode = 0;

try {
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("marketplace_account_id", accountId)
    .eq("supplier_article", ARTICLE)
    .maybeSingle();

  if (!product) {
    console.error("Product not found:", ARTICLE);
    exitCode = 1;
  } else {
    const productId = String(product.id);

    const { count: historyBefore } = await supabase
      .from("product_cost_history")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId);

    const productsBefore = await getProductProfitability(scope);
    const rowBefore = productsBefore.find((p) => p.modelCode.trim() === ARTICLE);
    const productCostBefore = rowBefore?.productCost ?? 0;

    const { data: latestBefore } = await supabase
      .from("product_cost_history")
      .select("cost")
      .eq("product_id", productId)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const currentCost = latestBefore?.[0]?.cost ?? 0;
    const newCost = currentCost + 50;

    console.log("=== Inline edit verification ===");
    console.log("Product:", ARTICLE, "id:", productId);
    console.log("Current cost:", currentCost, "→ new:", newCost);

    await updateProductPurchaseCost(productId, newCost, scope);

    const { count: historyAfter } = await supabase
      .from("product_cost_history")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId);

    const { data: allProducts } = await supabase
      .from("products")
      .select("id, supplier_article")
      .eq("marketplace_account_id", accountId);
    const costHistory = await fetchCostHistory(accountId);
    const paUnit = buildLatestCostByProductId(
      costHistory,
      (allProducts ?? []).map((p) => ({ id: String(p.id), supplier_article: p.supplier_article }))
    ).get(productId);

    const productsAfter = await getProductProfitability(scope);
    const rowAfter = productsAfter.find((p) => p.modelCode.trim() === ARTICLE);
    const productCostAfter = rowAfter?.productCost ?? 0;

    const { count: purchasesBefore } = await supabase
      .from("purchases")
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", accountId);
    const { count: linesBefore } = await supabase
      .from("purchase_lines")
      .select("*", { count: "exact", head: true });

    const templateRows = await buildCostTemplateRows(accountId);
    const buf = buildCostTemplateWorkbook(templateRows);
    const bulk = await bulkImportCostRecords(parseCostExcel(buf), accountId);

    const { count: purchasesAfter } = await supabase
      .from("purchases")
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", accountId);
    const { count: linesAfter } = await supabase
      .from("purchase_lines")
      .select("*", { count: "exact", head: true });

    const oneHistoryRow = historyAfter === historyBefore + 1;
    const paReflects = paUnit === newCost;
    const paProductCostChanged = productCostAfter !== productCostBefore && productCostAfter > 0;
    const bulkOk =
      bulk.errors.length === 0 &&
      purchasesBefore === purchasesAfter &&
      linesBefore === linesAfter;

    console.log("\n=== Results ===");
    console.log(oneHistoryRow ? "PASS" : "FAIL", "Inline edit creates one history row", {
      before: historyBefore,
      after: historyAfter,
    });
    console.log(paReflects ? "PASS" : "FAIL", "PA latest unit cost reflects edit", {
      expected: newCost,
      actual: paUnit,
    });
    console.log(
      paProductCostChanged ? "PASS" : "FAIL",
      "PA Product Cost changed",
      { before: productCostBefore, after: productCostAfter }
    );
    console.log(bulkOk ? "PASS" : "FAIL", "Bulk import unchanged (no purchase records)", bulk);

    const pass = oneHistoryRow && paReflects && paProductCostChanged && bulkOk;
    console.log("\n" + (pass ? "PASS" : "FAIL"));
    if (!pass) exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await session.cleanup();
}

process.exit(exitCode);
