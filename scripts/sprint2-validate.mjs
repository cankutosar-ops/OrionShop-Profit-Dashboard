#!/usr/bin/env node
/**
 * Sprint 2 post-sync validation report.
 * Usage: npx tsx scripts/sprint2-validate.mjs [from] [to]
 */

import { readFileSync } from "fs";
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

async function main() {
  loadEnv();
  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";
  const article = "ALEXASIYAH01";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: specRes } = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }).then((r) => r.json());

  const defs = specRes.definitions ?? {};
  const schema = {
    product_variants: Boolean(defs.product_variants),
    wb_stock: Boolean(defs.wb_stock),
    wb_orders_tech_size: "tech_size" in (defs.wb_orders?.properties ?? {}),
    wb_sales_tech_size: "tech_size" in (defs.wb_sales?.properties ?? {}),
  };

  const [{ count: variantCount }, { count: stockCount }] = await Promise.all([
    supabase.from("product_variants").select("*", { count: "exact", head: true }),
    supabase.from("wb_stock").select("*", { count: "exact", head: true }),
  ]);

  const { data: ordersSample } = await supabase
    .from("wb_orders")
    .select("tech_size")
    .not("tech_size", "is", null)
    .limit(1);
  const { count: ordersWithSize } = await supabase
    .from("wb_orders")
    .select("*", { count: "exact", head: true })
    .not("tech_size", "is", null);
  const { count: ordersTotal } = await supabase
    .from("wb_orders")
    .select("*", { count: "exact", head: true });

  const { data: salesSample } = await supabase
    .from("wb_sales")
    .select("tech_size")
    .not("tech_size", "is", null)
    .limit(1);
  const { count: salesWithSize } = await supabase
    .from("wb_sales")
    .select("*", { count: "exact", head: true })
    .not("tech_size", "is", null);
  const { count: salesTotal } = await supabase
    .from("wb_sales")
    .select("*", { count: "exact", head: true });

  const { data: product } = await supabase
    .from("products")
    .select("id, nm_id, supplier_article")
    .eq("supplier_article", article)
    .maybeSingle();

  let alex = null;
  let wbStock = null;

  if (product) {
    const productId = String(product.id);
    const [{ data: variants }, { data: stockRows }] = await Promise.all([
      supabase.from("product_variants").select("*").eq("product_id", productId),
      supabase.from("wb_stock").select("*").eq("product_id", productId),
    ]);

    const { buildProductFunnelMetrics } = await import("../src/lib/product-funnel-metrics.ts");
    const { buildSkuDisplayRows, collectCatalogVariantGroups } = await import(
      "../src/lib/product-sku-analytics.ts"
    );
    const { buildBarcodeToTechSizeMap, dedupeVariantsBySize, enrichRowsWithTechSize } =
      await import("../src/lib/product-variant-resolve.ts");

    const [{ data: orders }, { data: sales }] = await Promise.all([
      supabase
        .from("wb_orders")
        .select("*")
        .eq("product_id", productId)
        .gte("order_date", from)
        .lte("order_date", to),
      supabase
        .from("wb_sales")
        .select("*")
        .eq("product_id", productId)
        .gte("sale_date", from)
        .lte("sale_date", to),
    ]);

    const deduped = dedupeVariantsBySize(variants ?? []);
    const map = buildBarcodeToTechSizeMap(deduped);
    const sizedOrders = enrichRowsWithTechSize(orders ?? [], map);
    const sizedSales = enrichRowsWithTechSize(sales ?? [], map);
    const groups = collectCatalogVariantGroups(deduped);
    const skus = buildSkuDisplayRows(groups, sizedOrders, sizedSales, stockRows ?? []);
    const parent = buildProductFunnelMetrics(sizedOrders, sizedSales);

    const dbStockBySize = {};
    for (const row of stockRows ?? []) {
      const size = (row.tech_size ?? "").trim();
      dbStockBySize[size] = (dbStockBySize[size] ?? 0) + Number(row.quantity ?? 0);
    }

    const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
    const api = new WbApiClient();
    const wbRows = (await api.fetchStocks()).filter((r) => r.nmId === product.nm_id);
    const wbStockBySize = {};
    for (const row of wbRows) {
      const size = (row.techSize ?? "").trim();
      wbStockBySize[size] = (wbStockBySize[size] ?? 0) + Number(row.quantity ?? row.quantityFull ?? 0);
    }

    const stockMatch =
      JSON.stringify(Object.fromEntries(Object.entries(dbStockBySize).sort())) ===
      JSON.stringify(Object.fromEntries(Object.entries(wbStockBySize).sort()));

    alex = {
      productId,
      nm_id: product.nm_id,
      parentOrders: parent.orders,
      parentPurchases: parent.purchases,
      skuOrderSum: skus.reduce((s, r) => s + r.orders, 0),
      skuPurchaseSum: skus.reduce((s, r) => s + r.purchases, 0),
      sizes: skus.map((r) => r.size),
      skus,
      dbStockBySize,
      wbStockBySize,
      stockMatch,
      ordersMatch: parent.orders === skus.reduce((s, r) => s + r.orders, 0),
      purchasesMatch: parent.purchases === skus.reduce((s, r) => s + r.purchases, 0),
      eachSizeOnce: skus.length === new Set(skus.map((r) => r.size)).size,
    };
    wbStock = wbStockBySize;
  }

  const report = {
    schema,
    counts: {
      product_variants: variantCount,
      wb_stock: stockCount,
      ordersWithTechSize,
      ordersTotal,
      salesWithTechSize,
      salesTotal,
    },
    samples: {
      orderHasTechSize: Boolean(ordersSample?.length),
      saleHasTechSize: Boolean(salesSample?.length),
    },
    ALEXASIYAH01: alex,
  };

  console.log(JSON.stringify(report, null, 2));

  const pass =
    schema.product_variants &&
    schema.wb_stock &&
    schema.wb_orders_tech_size &&
    schema.wb_sales_tech_size &&
    (variantCount ?? 0) > 0 &&
    (stockCount ?? 0) > 0 &&
    (ordersWithSize ?? 0) > 0 &&
    (salesWithSize ?? 0) > 0 &&
    alex?.stockMatch &&
    alex?.ordersMatch &&
    alex?.purchasesMatch &&
    alex?.eachSizeOnce;

  console.log(pass ? "\nPASS" : "\nFAIL");
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
