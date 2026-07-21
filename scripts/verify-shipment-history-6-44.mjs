#!/usr/bin/env node
/**
 * Sprint 6.44 — verify inbound shipment history for one product.
 * Usage: npx tsx scripts/verify-shipment-history-6-44.mjs [accountId] [supplierArticle]
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";
const article = process.argv[3] ?? "ALEXAMOR";

const { getShipmentHistoryForProduct } = await import(
  "../src/services/shipment-history-service.ts"
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key);

const { data: products, error } = await sb
  .from("products")
  .select("id, supplier_article, nm_id")
  .eq("marketplace_account_id", accountId)
  .eq("supplier_article", article)
  .limit(1);

if (error || !products?.length) {
  console.error("Product not found:", article, error?.message);
  process.exit(1);
}

const product = products[0];
console.log(`Product ${product.supplier_article} id=${product.id} nm=${product.nm_id}`);
console.log("Fetching shipment history (may take a while on cold cache)…");

const started = Date.now();
const result = await getShipmentHistoryForProduct({
  marketplaceAccountId: String(accountId),
  productId: String(product.id),
});
const ms = Date.now() - started;

if (!result) {
  console.error("NULL result — Supabase not configured?");
  process.exit(1);
}

console.log(`OK in ${ms}ms · scanned=${result.suppliesScanned} · cached=${result.cached}`);
console.log(`Shipments: ${result.shipments.length}`);
for (const row of result.shipments.slice(0, 10)) {
  console.log(
    `  ${row.shipmentDate.slice(0, 10)}  ${row.warehouse}  qty=${row.quantityReceived}  supply=${row.supplyId}  ${row.status ?? ""}`
  );
}

const outPath = resolve("exports/verify-shipment-history-6-44.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      accountId,
      article,
      productId: product.id,
      nmId: product.nm_id,
      durationMs: ms,
      ...result,
    },
    null,
    2
  ),
  "utf8"
);
console.log(`Wrote ${outPath}`);

if (result.shipments.some((s) => !s.shipmentDate || !s.warehouse || s.quantityReceived <= 0)) {
  console.error("FAIL: shipment missing required fields");
  process.exit(1);
}

console.log(result.shipments.length > 0 ? "PASS (data present)" : "PASS (empty — no fabricated rows)");
