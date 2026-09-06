#!/usr/bin/env node
/**
 * PHASE 4 — READ-ONLY two-account data gap audit.
 * No WB calls. No writes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const TODAY = "2026-09-06";
const TARGET_FROM = "2026-08-08";
const TARGET_TO = TODAY;
const OUT = "exports/finance-backfill/_phase4-gap-audit.json";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
      }
    } catch {
      /* optional */
    }
  }
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function daysBetween(a, b) {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86400000);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function extent(sb, table, accountId, dateCol) {
  const { count, error: cErr } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  if (cErr) return { error: cErr.message };

  const { data: maxRow } = await sb
    .from(table)
    .select(dateCol)
    .eq("marketplace_account_id", accountId)
    .order(dateCol, { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: minRow } = await sb
    .from(table)
    .select(dateCol)
    .eq("marketplace_account_id", accountId)
    .order(dateCol, { ascending: true })
    .limit(1)
    .maybeSingle();

  const min = minRow?.[dateCol] ? String(minRow[dateCol]).slice(0, 10) : null;
  const max = maxRow?.[dateCol] ? String(maxRow[dateCol]).slice(0, 10) : null;
  return { count: count ?? 0, min, max };
}

async function countsInWindows(sb, table, accountId, dateCol) {
  const windows = {
    d7: { from: addDays(TODAY, -6), to: TODAY },
    d14: { from: addDays(TODAY, -13), to: TODAY },
    d30: { from: addDays(TODAY, -29), to: TODAY },
    target: { from: TARGET_FROM, to: TARGET_TO },
  };
  const out = {};
  for (const [k, w] of Object.entries(windows)) {
    const { count, error } = await sb
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", accountId)
      .gte(dateCol, w.from)
      .lte(dateCol, w.to);
    out[k] = error ? { error: error.message } : { from: w.from, to: w.to, count: count ?? 0 };
  }
  return out;
}

async function dailyPresence(sb, table, accountId, dateCol, from, to) {
  // Sample daily counts via RPC-less day loop (bounded window ~30 days)
  const days = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  const missing = [];
  const present = [];
  for (const day of days) {
    const { count, error } = await sb
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", accountId)
      .gte(dateCol, day)
      .lte(dateCol, day);
    if (error) return { error: error.message };
    if ((count ?? 0) > 0) present.push({ day, count });
    else missing.push(day);
  }
  return { missingDays: missing, presentDays: present.length, totalDays: days.length };
}

async function dupSourceKeys(sb, accountId) {
  const keys = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key")
      .eq("marketplace_account_id", accountId)
      .range(from, from + 999);
    if (error) return { error: error.message };
    const rows = data ?? [];
    for (const r of rows) {
      const k = r.source_key ?? "__NULL__";
      keys.set(k, (keys.get(k) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  let dupKeys = 0;
  let nullKeys = keys.get("__NULL__") ?? 0;
  for (const [k, n] of keys) {
    if (k !== "__NULL__" && n > 1) dupKeys += 1;
  }
  return { unique: keys.size - (nullKeys ? 1 : 0), dupKeys, nullKeys };
}

async function commercial(sb, accountId) {
  const { data, error } = await sb
    .from("commercial_entity_sync_state")
    .select("*")
    .eq("marketplace_account_id", accountId);
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}

async function warehouseEntity(sb, accountId) {
  const { data, error } = await sb
    .from("warehouse_entity_sync_state")
    .select("*")
    .eq("marketplace_account_id", accountId);
  if (error) return { error: error.message, note: "table_may_be_absent" };
  return { rows: data ?? [] };
}

async function inventoryExtent(sb, accountId) {
  // Prefer historical snapshots; also probe wb_stock
  const snap = await extent(sb, "historical_inventory_snapshots", accountId, "snapshot_date");
  const { data: stockRow, error: stockErr } = await sb
    .from("wb_stock")
    .select("last_synced_at")
    .eq("marketplace_account_id", accountId)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    historical_inventory_snapshots: snap,
    wb_stock_latest_synced_at: stockErr
      ? { error: stockErr.message }
      : stockRow?.last_synced_at ?? null,
  };
}

async function incrementalState(sb, accountId) {
  const { data, error } = await sb
    .from("finance_incremental_sync_state")
    .select("*")
    .eq("marketplace_account_id", accountId)
    .maybeSingle();
  if (error) {
    return {
      exists: false,
      error: error.message,
      tableMissing: /schema cache|does not exist|Could not find the table/i.test(error.message),
    };
  }
  return { exists: true, row: data };
}

async function accountMeta(sb, accountId) {
  const { data, error } = await sb
    .from("marketplace_accounts")
    .select(
      "id, account_name, company_id, seller_id, is_default, sync_enabled, last_sync_at, last_successful_sync_at, last_sync_status"
    )
    .eq("id", accountId)
    .maybeSingle();
  if (error) return { error: error.message };
  return data;
}

function gapRow(account, entity, min, max, expectedMax = TODAY) {
  let gap = null;
  let status = "unknown";
  if (!max) {
    gap = `empty → expected through ${expectedMax}`;
    status = "MISSING";
  } else if (max < expectedMax) {
    gap = `${addDays(max, 1)} → ${expectedMax} (${daysBetween(max, expectedMax)} days behind)`;
    status = "GAP";
  } else if (max === expectedMax) {
    gap = "none";
    status = "OK";
  } else {
    gap = `ahead (${max} > ${expectedMax})`;
    status = "OK";
  }
  return { Account: account, Entity: entity, "DB Min": min, "DB Max": max, "Expected Max": expectedMax, Gap: gap, Status: status };
}

async function auditAccount(sb, accountId) {
  const meta = await accountMeta(sb, accountId);
  const orders = await extent(sb, "wb_orders", accountId, "order_date");
  const sales = await extent(sb, "wb_sales", accountId, "sale_date");
  const finance = await extent(sb, "wb_finance", accountId, "operation_date");
  const ordersWindows = orders.error ? null : await countsInWindows(sb, "wb_orders", accountId, "order_date");
  const salesWindows = sales.error ? null : await countsInWindows(sb, "wb_sales", accountId, "sale_date");
  const financeWindows = finance.error
    ? null
    : await countsInWindows(sb, "wb_finance", accountId, "operation_date");
  const ordersDaily = orders.error
    ? null
    : await dailyPresence(sb, "wb_orders", accountId, "order_date", TARGET_FROM, TARGET_TO);
  const salesDaily = sales.error
    ? null
    : await dailyPresence(sb, "wb_sales", accountId, "sale_date", TARGET_FROM, TARGET_TO);
  const financeDaily = finance.error
    ? null
    : await dailyPresence(sb, "wb_finance", accountId, "operation_date", TARGET_FROM, TARGET_TO);
  const dups = await dupSourceKeys(sb, accountId);
  const cc = await commercial(sb, accountId);
  const wh = await warehouseEntity(sb, accountId);
  const inv = await inventoryExtent(sb, accountId);
  const inc = await incrementalState(sb, accountId);

  const table = [
    gapRow(accountId, "orders", orders.min, orders.max),
    gapRow(accountId, "sales", sales.min, sales.max),
    gapRow(accountId, "finance", finance.min, finance.max),
    gapRow(
      accountId,
      "inventory_snapshots",
      inv.historical_inventory_snapshots?.min ?? null,
      inv.historical_inventory_snapshots?.max ?? null
    ),
  ];

  return {
    meta,
    orders,
    sales,
    finance,
    ordersWindows,
    salesWindows,
    financeWindows,
    ordersDaily,
    salesDaily,
    financeDaily,
    dups,
    commercial: cc,
    warehouseEntity: wh,
    inventory: inv,
    incremental: inc,
    gapTable: table,
  };
}

async function main() {
  loadEnv();
  const sb = admin();
  const a1 = await auditAccount(sb, "1");
  const a2 = await auditAccount(sb, "2");
  const report = {
    auditedAt: new Date().toISOString(),
    today: TODAY,
    targetWindow: { from: TARGET_FROM, to: TARGET_TO },
    reservationEnv: process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE ?? null,
    liveEnv: process.env.FINANCE_V1_LIVE_REQUESTS_ENABLED ?? null,
    account1: a1,
    account2: a2,
    gapTable: [...a1.gapTable, ...a2.gapTable],
  };
  mkdirSync(resolve("exports/finance-backfill"), { recursive: true });
  writeFileSync(resolve(OUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: OUT, gapTable: report.gapTable, a1Max: {
    orders: a1.orders.max, sales: a1.sales.max, finance: a1.finance.max,
    inv: a1.inventory.historical_inventory_snapshots?.max, dups: a1.dups,
    inc: a1.incremental.exists, cc: (a1.commercial.rows||[]).map(r=>({e:r.entity,d:r.latest_data_date,s:r.status}))
  }, a2Max: {
    orders: a2.orders.max, sales: a2.sales.max, finance: a2.finance.max,
    inv: a2.inventory.historical_inventory_snapshots?.max, dups: a2.dups,
    seller: a2.meta?.seller_id, inc: a2.incremental, cc: (a2.commercial.rows||[]).map(r=>({e:r.entity,d:r.latest_data_date,s:r.status}))
  }, missingDays: {
    a1orders: a1.ordersDaily?.missingDays, a1sales: a1.salesDaily?.missingDays, a1finance: a1.financeDaily?.missingDays,
    a2orders: a2.ordersDaily?.missingDays, a2sales: a2.salesDaily?.missingDays, a2finance: a2.financeDaily?.missingDays,
  }}, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
