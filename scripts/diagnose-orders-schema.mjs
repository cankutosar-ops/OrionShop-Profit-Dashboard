#!/usr/bin/env node
/**
 * Sprint 9.2 — read-only schema + extent probe (no upserts / no deletes).
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const account = process.argv[2] ?? "1";
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const colProbe = await c.from("wb_orders").select("last_change_date").limit(1);
const priceProbe = await c.from("wb_orders").select("price_with_disc").limit(1);
const top = await c
  .from("wb_orders")
  .select("order_date,srid,created_at")
  .eq("marketplace_account_id", account)
  .order("order_date", { ascending: false })
  .limit(8);
const gapOrders = await c
  .from("wb_orders")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", account)
  .gte("order_date", "2026-07-13")
  .lte("order_date", "2026-07-24");
const gapSales = await c
  .from("wb_sales")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", account)
  .gte("sale_date", "2026-07-13")
  .lte("sale_date", "2026-07-24");

console.log(
  JSON.stringify(
    {
      schema: {
        last_change_date: colProbe.error
          ? { exists: false, error: colProbe.error.message, code: colProbe.error.code }
          : { exists: true },
        price_with_disc: priceProbe.error
          ? { exists: false, error: priceProbe.error.message, code: priceProbe.error.code }
          : { exists: true },
      },
      topOrdersByOrderDate: top.data,
      topError: top.error,
      ordersInGap: gapOrders.count,
      salesInGap: gapSales.count,
    },
    null,
    2
  )
);
