#!/usr/bin/env node
/** Sprint 9.2 — read-only DB extent probe for orders. */
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

const topOrder = await c
  .from("wb_orders")
  .select("order_date,last_change_date,srid")
  .eq("marketplace_account_id", account)
  .order("order_date", { ascending: false })
  .limit(5);
const topChange = await c
  .from("wb_orders")
  .select("order_date,last_change_date,srid")
  .eq("marketplace_account_id", account)
  .order("last_change_date", { ascending: false })
  .limit(5);
const inGap = await c
  .from("wb_orders")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", account)
  .gte("order_date", "2026-07-13")
  .lte("order_date", "2026-07-24");
const salesGap = await c
  .from("wb_sales")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", account)
  .gte("sale_date", "2026-07-13")
  .lte("sale_date", "2026-07-24");
const acct = await c
  .from("marketplace_accounts")
  .select("last_sync_at,last_successful_sync_at,last_sync_status")
  .eq("id", account)
  .maybeSingle();

console.log(
  JSON.stringify(
    {
      topOrderByOrderDate: topOrder.data,
      topOrderError: topOrder.error,
      topByLastChange: topChange.data,
      topChangeError: topChange.error,
      ordersInGapCount: inGap.count,
      salesInGapCount: salesGap.count,
      account: acct.data,
    },
    null,
    2
  )
);
