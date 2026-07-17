#!/usr/bin/env node
import { readFileSync } from "fs";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { aggregateSalesMetrics } from "../src/lib/sales-metrics.ts";
import { buildNetSalesFromDb } from "../src/lib/sales-revenue-resolution.ts";
import { buildOrdersPurchasesKpis } from "../src/lib/orders-purchases-metrics.ts";
import {
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "../src/services/persisted-query-service.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const TARGET = {
  netSales: 871_639.38,
  sold: 170,
  returned: 43,
  net: 127,
  ordersTotal: 747,
  ordersValue: 8_915_200,
};

const ranges = [];
for (let days = 26; days <= 32; days++) {
  const to = new Date("2026-07-12T12:00:00");
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  ranges.push([
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10),
    `${days}d ending Jul12`,
  ]);
}
ranges.push(["2026-06-15", "2026-07-12", "Jun15-Jul12"]);

const client = createAdminClient();
const products = await fetchProductsWithRelations("1", client);
const productIds = products.map((p) => String(p.id));

const hits = [];
for (const [from, to, label] of ranges) {
  const scope = { marketplaceAccountId: "1", from, to };
  const [sales, orders] = await Promise.all([
    fetchSalesInRange(scope, client, { productIds }),
    fetchOrdersInRange(scope, client, { productIds }),
  ]);
  const b = aggregateSalesMetrics(sales);
  const ns = buildNetSalesFromDb(sales);
  const kpis = buildOrdersPurchasesKpis(orders, sales);
  const totalOrders = kpis.ordersCount + kpis.cancelledOrdersCount;
  const row = {
    label,
    from,
    to,
    sold: b.unitsSold,
    returned: b.unitsReturned,
    net: b.unitsSold - b.unitsReturned,
    netSales: Math.round(ns.netSales * 100) / 100,
    ordersTotal: totalOrders,
    ordersValue: Math.round(kpis.ordersValue),
  };
  const matches =
    row.sold === TARGET.sold &&
    row.returned === TARGET.returned &&
    Math.abs(row.netSales - TARGET.netSales) < 1;
  if (matches) hits.push(row);
  if (
    Math.abs(row.netSales - TARGET.netSales) < 5000 ||
    row.sold === TARGET.sold
  ) {
    console.log(JSON.stringify(row));
  }
}
console.log("EXACT_HITS", JSON.stringify(hits));
