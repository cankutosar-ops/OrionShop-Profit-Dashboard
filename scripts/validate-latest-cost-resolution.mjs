#!/usr/bin/env node
/** Verify unified latest cost resolution (effective_from → created_at → id). */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const { getValidationAccountId } = await import("./lib/validation-isolation.mjs");

const accountId = getValidationAccountId(process.argv[2] ?? "2");
const ARTICLE = "i8-80444";
const EXPECTED = 1510.77;
const SAME_DAY = "2026-06-29";

const {
  compareLatestCostHistory,
  buildLatestCostByProductId,
  pickLatestCostHistoryByProductId,
} = await import("../src/lib/cost-history-resolution.ts");
const { fetchCostRecords } = await import("../src/services/cost-service.ts");
const { fetchCostHistory, getProductProfitability } = await import(
  "../src/services/dashboard-service.ts"
);
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

console.log("=== Sprint 5.2 — Latest Cost Resolution ===\n");

const synthetic = [
  {
    id: "100",
    product_id: "137",
    cost: 1100,
    effective_from: SAME_DAY,
    effective_to: null,
    created_at: "2026-06-29T10:00:00.000Z",
  },
  {
    id: "200",
    product_id: "137",
    cost: 1410.77,
    effective_from: SAME_DAY,
    effective_to: null,
    created_at: "2026-06-29T11:00:00.000Z",
  },
  {
    id: "300",
    product_id: "137",
    cost: EXPECTED,
    effective_from: SAME_DAY,
    effective_to: null,
    created_at: "2026-06-29T12:00:00.000Z",
  },
];

const syntheticTieCreatedAt = [
  {
    id: "100",
    product_id: "137",
    cost: 1100,
    effective_from: SAME_DAY,
    effective_to: null,
    created_at: "2026-06-29T12:00:00.000Z",
  },
  {
    id: "300",
    product_id: "137",
    cost: EXPECTED,
    effective_from: SAME_DAY,
    effective_to: null,
    created_at: "2026-06-29T12:00:00.000Z",
  },
];

const byProductSynthetic = pickLatestCostHistoryByProductId(synthetic);
const syntheticLatest = byProductSynthetic.get("137")?.cost;
const tieLatest = pickLatestCostHistoryByProductId(syntheticTieCreatedAt).get("137")?.cost;

const products = [{ id: "137", supplier_article: ARTICLE }];
const paSynthetic = buildLatestCostByProductId(synthetic, products).get("137");

console.log("Unit — three costs same day (1100 / 1410.77 / 1510.77):");
console.log(
  syntheticLatest === EXPECTED ? "PASS" : "FAIL",
  "pickLatestCostHistoryByProductId",
  { expected: EXPECTED, actual: syntheticLatest }
);
console.log(
  paSynthetic === EXPECTED ? "PASS" : "FAIL",
  "buildLatestCostByProductId",
  { expected: EXPECTED, actual: paSynthetic }
);
console.log(
  tieLatest === EXPECTED ? "PASS" : "FAIL",
  "id tiebreak when created_at equal",
  { expected: EXPECTED, actual: tieLatest }
);

let pass = syntheticLatest === EXPECTED && paSynthetic === EXPECTED && tieLatest === EXPECTED;

const supabase = createAdminClient();
const scope = await resolveScopedDateRange({ account: accountId });

const { data: product } = await supabase
  .from("products")
  .select("id, supplier_article")
  .eq("marketplace_account_id", accountId)
  .eq("supplier_article", ARTICLE)
  .maybeSingle();

if (!product) {
  console.error("\nFAIL  Product not found:", ARTICLE);
  process.exit(1);
}

const productId = String(product.id);

const { data: allProducts } = await supabase
  .from("products")
  .select("id, supplier_article")
  .eq("marketplace_account_id", accountId);

const costHistory = await fetchCostHistory(accountId);
const costMgmt = (await fetchCostRecords(accountId)).find(
  (row) => row.supplier_article.trim() === ARTICLE
)?.cost;
const paLatest = buildLatestCostByProductId(
  costHistory,
  (allProducts ?? []).map((p) => ({ id: String(p.id), supplier_article: p.supplier_article }))
).get(productId);

const profitability = await getProductProfitability(scope);
const profitRow = profitability.find((p) => p.modelCode.trim() === ARTICLE);
const paUnitFromProfit =
  profitRow && profitRow.unitsSold > 0 ? profitRow.productCost / profitRow.unitsSold : null;

const smartInputs = await getSmartPricingInputs(scope);
const smartRow = smartInputs?.find((row) => row.supplierArticle.trim() === ARTICLE);

console.log("\nIntegration — all modules agree on global latest cost:");
console.log("  Cost Management:", costMgmt);
console.log("  Product Analytics:", paLatest);
console.log("  Dashboard:", paUnitFromProfit);
console.log("  Smart Pricing:", smartRow?.unitProductCost ?? null);

const globalConsistent =
  costMgmt === paLatest &&
  paLatest !== undefined &&
  paUnitFromProfit !== null &&
  Math.abs(Number(paUnitFromProfit) - Number(paLatest)) < 0.01 &&
  smartRow?.unitProductCost !== undefined &&
  Math.abs(Number(smartRow.unitProductCost) - Number(paLatest)) < 0.01;

console.log(
  globalConsistent ? "PASS" : "FAIL",
  "Cost Management / PA / Dashboard / Smart Pricing match",
  { costMgmt, paLatest, paUnitFromProfit, smart: smartRow?.unitProductCost ?? null }
);

pass = pass && globalConsistent;

console.log("\n" + (pass ? "PASS" : "FAIL"));
process.exit(pass ? 0 : 1);
