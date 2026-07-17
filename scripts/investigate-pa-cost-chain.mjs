#!/usr/bin/env node
/** Trace cost chain for a supplier article — investigation only. */
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

const supplierArticle = process.argv[2] ?? "i8-80444";
const accountId = process.argv[3] ?? "2";

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { buildLatestCostByProductId } = await import("../src/lib/cost-history-resolution.ts");
const { getProductProfitability } = await import("../src/services/dashboard-service.ts");

const supabase = createAdminClient();

console.log(`=== Cost chain investigation: ${JSON.stringify(supplierArticle)} (account ${accountId}) ===\n`);

// Resolve product(s) — exact and trimmed
const { data: productsExact, error: pErr } = await supabase
  .from("products")
  .select("id, supplier_article, name, marketplace_account_id")
  .eq("marketplace_account_id", accountId)
  .eq("supplier_article", supplierArticle);

const { data: productsIlike, error: pErr2 } = await supabase
  .from("products")
  .select("id, supplier_article, name, marketplace_account_id")
  .eq("marketplace_account_id", accountId)
  .ilike("supplier_article", `%${supplierArticle.replace(/[%_]/g, "")}%`);

if (pErr) throw new Error(pErr.message);

const products = productsExact?.length ? productsExact : (productsIlike ?? []);
console.log("Product record(s):");
if (!products.length) {
  console.log("  NONE FOUND");
} else {
  for (const p of products) {
    console.log(
      " ",
      JSON.stringify({
        id: p.id,
        supplier_article: p.supplier_article,
        article_codes: [...p.supplier_article].map((c) => c.charCodeAt(0)),
        name: p.name,
      })
    );
  }
}

const productIds = products.map((p) => String(p.id));

console.log("\n1. purchase_lines row(s):");
const { data: lines, error: lErr } = await supabase
  .from("purchase_lines")
  .select("*, purchase:purchases(id, purchase_date, supplier, currency, marketplace_account_id)")
  .eq("supplier_article", supplierArticle)
  .order("created_at", { ascending: false });

if (lErr) {
  console.log("  ERROR:", lErr.message);
} else {
  const scoped = (lines ?? []).filter(
    (row) => String(row.purchase?.marketplace_account_id) === accountId
  );
  if (!scoped.length && productIds.length) {
    const { data: linesByProduct } = await supabase
      .from("purchase_lines")
      .select("*, purchase:purchases(id, purchase_date, supplier, currency, marketplace_account_id)")
      .in("product_id", productIds)
      .order("created_at", { ascending: false });
    for (const row of linesByProduct ?? []) {
      console.log(" ", JSON.stringify(row, null, 2));
    }
    if (!(linesByProduct ?? []).length) console.log("  NONE FOUND");
  } else {
    for (const row of scoped) console.log(" ", JSON.stringify(row, null, 2));
    if (!scoped.length) console.log("  NONE FOUND (by supplier_article exact match)");
  }
}

console.log("\n2. product_cost_history row(s):");
if (!productIds.length) {
  console.log("  SKIPPED — no product id");
} else {
  const { data: history, error: hErr } = await supabase
    .from("product_cost_history")
    .select("*")
    .in("product_id", productIds)
    .order("effective_from", { ascending: false });

  if (hErr) console.log("  ERROR:", hErr.message);
  else if (!(history ?? []).length) console.log("  NONE FOUND");
  else for (const row of history) console.log(" ", JSON.stringify(row));
}

console.log("\n3. Product Analytics cost lookup (buildLatestCostByProductId):");
const { data: allProducts, error: apErr } = await supabase
  .from("products")
  .select("id, supplier_article, name, category:categories(name), brand:brands(name)")
  .eq("marketplace_account_id", accountId);

if (apErr) throw new Error(apErr.message);

const { data: allHistory, error: ahErr } = await supabase
  .from("product_cost_history")
  .select("*")
  .order("effective_from", { ascending: false });

if (ahErr) throw new Error(ahErr.message);

const accountProductIds = new Set((allProducts ?? []).map((p) => String(p.id)));
const scopedHistory = (allHistory ?? []).filter((row) =>
  accountProductIds.has(String(row.product_id))
);

const latestMap = buildLatestCostByProductId(
  scopedHistory.map((row) => ({
    id: String(row.id),
    product_id: String(row.product_id),
    cost: Number(row.cost),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    created_at: row.created_at,
  })),
  (allProducts ?? []).map((p) => ({ id: String(p.id), supplier_article: p.supplier_article }))
);

for (const p of products) {
  const pid = String(p.id);
  const lookup = latestMap.get(pid);
  console.log(`  product_id=${pid} supplier_article=${JSON.stringify(p.supplier_article)}`);
  console.log(`    latestCostByProductId.get(product_id) => ${lookup ?? "undefined (→ 0 in PA)"}`);

  // Show article-level grouping used internally
  const articleKey = p.supplier_article;
  const articleEntries = scopedHistory.filter((h) => {
    const prod = (allProducts ?? []).find((x) => String(x.id) === String(h.product_id));
    return prod?.supplier_article === articleKey;
  });
  console.log(`    history rows for same article key: ${articleEntries.length}`);
  if (articleEntries.length) {
    const latest = [...articleEntries].sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from)
    )[0];
    console.log(`    latest by article key: cost=${latest.cost} effective_from=${latest.effective_from}`);
  }

  // Trimmed article check
  const trimmedKey = p.supplier_article.trim();
  if (trimmedKey !== articleKey) {
    const trimmedLookup = [...latestMap.entries()].find(([id]) => id === pid);
    console.log(`    NOTE: DB article has whitespace; trimmed="${trimmedKey}"`);
    const byTrimmedArticle = (allProducts ?? []).filter(
      (x) => x.supplier_article.trim() === trimmedKey
    );
    console.log(`    products sharing trimmed article: ${byTrimmedArticle.length}`);
  }
}

console.log("\n4. Final Product Cost in Product Analytics (getProductProfitability):");
const wideScope = {
  marketplaceAccountId: accountId,
  from: "2020-01-01",
  to: "2030-12-31",
};
const { getDefaultDateRange } = await import("../src/lib/utils.ts");
const defaultRange = getDefaultDateRange();
const defaultScope = { marketplaceAccountId: accountId, ...defaultRange };

for (const [label, scope] of [
  ["wide range", wideScope],
  ["default 30-day range", defaultScope],
]) {
  console.log(`\n  [${label}: ${scope.from} → ${scope.to}]`);
  const paRows = await getProductProfitability(scope, supabase);
  const paMatch = paRows.filter(
    (row) =>
      row.modelCode === supplierArticle ||
      row.modelCode?.trim() === supplierArticle.trim() ||
      productIds.includes(String(row.productId))
  );

  if (!paMatch.length) {
    console.log("    Product not in PA result set (no orders/sales/revenue/ads in range)");
    const lookup = productIds[0] ? latestMap.get(productIds[0]) : undefined;
    console.log(`    latestCostByProductId would be: ${lookup ?? "undefined → unit cost 0 per sale"}`);
  } else {
    for (const row of paMatch) {
      console.log(
        "   ",
        JSON.stringify({
          productId: row.productId,
          modelCode: row.modelCode,
          productCost: row.productCost,
          revenue: row.revenue,
          purchases: row.purchases,
          orders: row.orders,
          unitsSold: row.unitsSold,
        })
      );
    }
  }
}

console.log("\n=== Chain break analysis ===");
const { data: linesByProductId } = productIds.length
  ? await supabase.from("purchase_lines").select("id").in("product_id", productIds).limit(1)
  : { data: [] };
const hasLine =
  (lines ?? []).some((l) => productIds.includes(String(l.product_id))) ||
  (linesByProductId ?? []).length > 0;
const hasHistory =
  productIds.length &&
  (
    await supabase
      .from("product_cost_history")
      .select("id")
      .in("product_id", productIds)
      .limit(1)
  ).data?.length;

if (!products.length) console.log("BREAK: product not found in catalog");
else if (!hasLine) console.log("BREAK: no purchase_lines for product");
else if (!hasHistory) console.log("BREAK: no product_cost_history row after import");
else {
  const pid = String(products[0].id);
  const mapCost = latestMap.get(pid);
  if (mapCost === undefined) {
    console.log("BREAK: buildLatestCostByProductId returns undefined for product_id");
    console.log("  Likely cause: supplier_article key mismatch in latest-by-article grouping");
  } else if (!paMatch.length) {
    console.log("BREAK: product excluded from PA table OR productCost=0 due to no sales in date range");
  } else if (paMatch[0].productCost === 0) {
    console.log("BREAK: PA row exists but productCost is 0 — check sales × cost calculation in computeProductCost");
  } else {
    console.log("NO BREAK: chain appears complete");
  }
}
