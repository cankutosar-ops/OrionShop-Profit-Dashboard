#!/usr/bin/env node
/** Trace purchase import pipeline step-by-step for account 2. */
import { readFileSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const accountId = process.argv[2] ?? "2";

const { fetchProductOptions } = await import("../src/services/cost-service.ts");
const { parsePurchaseExcel } = await import("../src/lib/purchase-excel.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

const products = await fetchProductOptions(accountId);
const sample = products.slice(0, 3);

console.log("=== Purchase import investigation ===\n");
console.log(`Account: ${accountId}, catalog size: ${products.length}\n`);

const importRows = sample.map((product, index) => ({
  "Supplier Article": product.supplier_article,
  Quantity: 100 + index,
  "Unit Cost": 12.5 + index,
}));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importRows), "Purchases");
const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

console.log("STEP 1 — Parsed Excel rows");
let parsed;
try {
  parsed = parsePurchaseExcel(buf);
  console.log(`  PASS  ${parsed.rows.length} rows, ${parsed.skipped} skipped at parse`);
  for (const row of parsed.rows) {
    console.log(`    row ${row.row}:`, JSON.stringify(row));
  }
} catch (err) {
  console.log("  FAIL ", err instanceof Error ? err.message : err);
  process.exit(1);
}

console.log("\nSTEP 2 — Parsed quantity");
for (const row of parsed.rows) {
  const ok = Number.isInteger(row.quantity) && row.quantity > 0;
  console.log(`  row ${row.row}: ${row.quantity} => ${ok ? "PASS" : "FAIL"}`);
}

console.log("\nSTEP 3 — Parsed unit_cost");
for (const row of parsed.rows) {
  const ok = Number.isFinite(row.unit_cost) && row.unit_cost >= 0;
  console.log(`  row ${row.row}: ${row.unit_cost} => ${ok ? "PASS" : "FAIL"}`);
}

console.log("\nSTEP 4 — supplier_article lookup");
const supabase = createAdminClient();
const importProducts = await fetchProductOptions(accountId, supabase);
const productByArticle = new Map(importProducts.map((p) => [p.supplier_article.trim(), p.id]));

console.log(`  Catalog loaded at import: ${importProducts.length} products`);
console.log(`  Map size: ${productByArticle.size}`);

let firstFail = null;
for (const row of parsed.rows) {
  const fromServer = products.find((p) => p.supplier_article.trim() === row.supplier_article.trim());
  const fromMap = productByArticle.get(row.supplier_article.trim());
  const dbLookup = await supabase
    .from("products")
    .select("id, supplier_article, marketplace_account_id")
    .eq("supplier_article", row.supplier_article)
    .eq("marketplace_account_id", accountId)
    .maybeSingle();

  console.log(`  row ${row.row} article=${JSON.stringify(row.supplier_article)}`);
  console.log(`    fetchProductOptions (server): ${fromServer ? `id=${fromServer.id}` : "MISSING"}`);
  console.log(`    Map lookup (import path):   ${fromMap ?? "MISSING"}`);
  console.log(
    `    Direct DB eq lookup:        ${dbLookup.error ? `ERROR ${dbLookup.error.message}` : dbLookup.data ? `id=${dbLookup.data.id}` : "MISSING"}`
  );

  if (!fromMap && !firstFail) {
    firstFail = {
      step: 4,
      row: row.row,
      message: `Product not found for supplier article "${row.supplier_article}"`,
      detail: {
        parsed_article: row.supplier_article,
        char_codes: [...row.supplier_article].map((c) => c.charCodeAt(0)),
        catalog_has_exact: importProducts.some((p) => p.supplier_article === row.supplier_article),
        catalog_has_trimmed: importProducts.some(
          (p) => p.supplier_article.trim() === row.supplier_article.trim()
        ),
        duplicate_articles_in_catalog: importProducts.filter(
          (p) => p.supplier_article === row.supplier_article
        ).length,
      },
    };
  }
}

if (firstFail) {
  console.log("\n=== FIRST FAILING STEP ===");
  console.log(`Step: ${firstFail.step} — supplier_article lookup`);
  console.log(`Row: ${firstFail.row}`);
  console.log(`Error: ${firstFail.message}`);
  console.log("Detail:", JSON.stringify(firstFail.detail, null, 2));
  process.exit(1);
}

console.log("\nSTEP 5 — purchase_lines insert (dry run first row only)");
const row = parsed.rows[0];
const productId = productByArticle.get(row.supplier_article.trim());
const { data: purchaseRow, error: purchaseError } = await supabase
  .from("purchases")
  .insert({
    marketplace_account_id: accountId,
    purchase_date: new Date().toISOString().split("T")[0],
    supplier: "Investigation",
    currency: "USD",
    exchange_rate: null,
    notes: "investigate script",
    updated_at: new Date().toISOString(),
  })
  .select("id")
  .single();

if (purchaseError) {
  console.log(`  FAIL  ${purchaseError.message}`);
  process.exit(1);
}

const { error: lineError } = await supabase.from("purchase_lines").insert({
  purchase_id: purchaseRow.id,
  product_id: productId,
  supplier_article: row.supplier_article,
  quantity: row.quantity,
  unit_cost: row.unit_cost,
});

console.log(lineError ? `  FAIL  ${lineError.message}` : "  PASS  line inserted");

console.log("\nSTEP 6 — product_cost_history insert");
const { recordProductCostHistory } = await import("../src/services/cost-service.ts");
try {
  await recordProductCostHistory(
    productId,
    { cost: row.unit_cost, effective_from: new Date().toISOString().split("T")[0] },
    supabase
  );
  console.log("  PASS  cost history recorded");
} catch (err) {
  console.log(`  FAIL  ${err instanceof Error ? err.message : err}`);
}

await supabase.from("purchases").delete().eq("id", purchaseRow.id);
console.log("\nAll steps passed for sample row.");
