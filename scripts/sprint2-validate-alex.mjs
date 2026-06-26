#!/usr/bin/env node
/**
 * Sprint 2 validation for ALEXASIYAH01 SKU + stock infrastructure.
 *
 * Usage: npx tsx scripts/sprint2-validate-alex.mjs [from] [to]
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

function sumQuantity(rows) {
  return rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);

  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";
  const article = "ALEXASIYAH01";

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, supplier_article, nm_id")
    .eq("supplier_article", article)
    .maybeSingle();

  if (productError || !product) {
    throw new Error(`Product ${article} not found: ${productError?.message ?? "missing"}`);
  }

  const productId = String(product.id);

  const [{ data: orders }, { data: sales }, { data: variants }, { data: stock }] =
    await Promise.all([
      supabase
        .from("wb_orders")
        .select("quantity, tech_size, barcode, status")
        .eq("product_id", productId)
        .gte("order_date", from)
        .lte("order_date", to),
      supabase
        .from("wb_sales")
        .select("quantity, tech_size, barcode, is_return")
        .eq("product_id", productId)
        .gte("sale_date", from)
        .lte("sale_date", to),
      supabase.from("product_variants").select("*").eq("product_id", productId),
      supabase.from("wb_stock").select("*").eq("product_id", productId),
    ]);

  const { buildProductFunnelMetrics } = await import("../src/lib/product-funnel-metrics.ts");
  const { buildSkuDisplayRows, collectCatalogVariantGroups } = await import(
    "../src/lib/product-sku-analytics.ts"
  );
  const { buildBarcodeToTechSizeMap, dedupeVariantsBySize, enrichRowsWithTechSize } =
    await import("../src/lib/product-variant-resolve.ts");

  const dedupedVariants = dedupeVariantsBySize(variants ?? []);
  const barcodeMap = buildBarcodeToTechSizeMap(dedupedVariants);
  const sizedOrders = enrichRowsWithTechSize(orders ?? [], barcodeMap);
  const sizedSales = enrichRowsWithTechSize(sales ?? [], barcodeMap);
  const groups = collectCatalogVariantGroups(dedupedVariants);
  const skus = buildSkuDisplayRows(groups, sizedOrders, sizedSales, stock ?? []);

  const parentFunnel = buildProductFunnelMetrics(sizedOrders, sizedSales);
  const skuOrderSum = skus.reduce((sum, row) => sum + row.orders, 0);
  const skuPurchaseSum = skus.reduce((sum, row) => sum + row.purchases, 0);

  const sizes = skus.map((row) => row.size);
  const uniqueSizes = new Set(sizes);
  const duplicateSizes = sizes.length !== uniqueSizes.size;

  const stockBySize = new Map();
  for (const row of stock ?? []) {
    const size = (row.tech_size ?? "").trim();
    stockBySize.set(size, (stockBySize.get(size) ?? 0) + Number(row.quantity ?? 0));
  }

  const ordersWithSize = sizedOrders.filter((row) => row.tech_size?.trim()).length;
  const salesWithSize = sizedSales.filter((row) => row.tech_size?.trim()).length;

  const report = {
    product: { id: productId, article, nm_id: product.nm_id },
    range: { from, to },
    parent: {
      orders: parentFunnel.orders,
      purchases: parentFunnel.purchases,
    },
    skuTotals: {
      orders: skuOrderSum,
      purchases: skuPurchaseSum,
      rowCount: skus.length,
    },
    checks: {
      ordersMatch: parentFunnel.orders === skuOrderSum,
      purchasesMatch: parentFunnel.purchases === skuPurchaseSum,
      eachSizeOnce: !duplicateSizes && skus.length === groups.length,
      variantsInDb: (variants ?? []).length,
      stockRowsInDb: (stock ?? []).length,
      ordersWithTechSize: ordersWithSize,
      salesWithTechSize: salesWithSize,
      totalOrders: (orders ?? []).length,
      totalSales: (sales ?? []).length,
    },
    skus: skus.map((row) => ({
      size: row.size,
      barcode: row.barcode,
      currentStock: row.currentStock,
      orders: row.orders,
      purchases: row.purchases,
    })),
    stockBySize: Object.fromEntries(stockBySize),
  };

  console.log(JSON.stringify(report, null, 2));

  const pass =
    report.checks.ordersMatch &&
    report.checks.purchasesMatch &&
    report.checks.eachSizeOnce &&
    report.checks.variantsInDb > 0 &&
    report.checks.stockRowsInDb > 0;

  console.log(pass ? "\nPASS" : "\nFAIL");
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
