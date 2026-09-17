#!/usr/bin/env node
/** Read-only account reconciliation after migration and canonical ingestion. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reconcileCurrentStock } from "../src/lib/current-stock-reconciliation.ts";

const accountId = process.argv[2];
if (!/^\d+$/.test(accountId ?? "")) {
  throw new Error("Usage: npx tsx scripts/reconcile-canonical-current-stock.mjs ACCOUNT_ID");
}
for (const name of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(name), "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch { /* optional local env */ }
}
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const client = createAdminClient();

async function pageAll(table, columns) {
  const rows = [];
  for (let from = 0;; from += 1000) {
    const { data, error } = await client.from(table).select(columns)
      .eq("marketplace_account_id", accountId).range(from, from + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

const [products, legacy, canonical] = await Promise.all([
  pageAll("products", "id,nm_id"),
  pageAll("wb_stock", "product_id,tech_size,barcode,warehouse,quantity"),
  pageAll("wb_current_stocks", "nm_id,chrt_id,warehouse_name,tech_size,barcode,quantity"),
]);
const nmByProduct = new Map(products.map((row) => [String(row.id), Number(row.nm_id)]));
const legacyRows = legacy.map((row) => ({
  nmId: nmByProduct.get(String(row.product_id)) ?? 0,
  warehouse: String(row.warehouse ?? "").trim(),
  quantity: Number(row.quantity ?? 0),
  variant: row.tech_size || row.barcode ? `${row.tech_size ?? ""}|${row.barcode ?? ""}` : null,
}));
const canonicalRows = canonical.map((row) => ({
  nmId: Number(row.nm_id),
  warehouse: String(row.warehouse_name ?? "").trim(),
  quantity: Number(row.quantity ?? 0),
  variant: row.tech_size || row.barcode ? `${row.tech_size ?? ""}|${row.barcode ?? ""}` : null,
}));
console.log(JSON.stringify({
  accountId,
  legacyRows: legacyRows.length,
  canonicalRows: canonicalRows.length,
  ...reconcileCurrentStock(legacyRows, canonicalRows),
}, null, 2));
