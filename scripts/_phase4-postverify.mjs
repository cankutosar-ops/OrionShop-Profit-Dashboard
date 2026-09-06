#!/usr/bin/env node
/** PHASE 4 post-verify + continuity reconcile (finance latest_data_date only). */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(name), "utf8").split("\n")) {
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

async function financeMax(sb, id) {
  const { count } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", id);
  const { data } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    count: count ?? 0,
    max: data?.operation_date ? String(data.operation_date).slice(0, 10) : null,
  };
}

async function dups(sb, id) {
  const keys = new Map();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key")
      .eq("marketplace_account_id", id)
      .range(from, from + 999);
    if (error) throw error;
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
  for (const [k, n] of keys) if (k !== "__NULL__" && n > 1) dupKeys += 1;
  return { unique: keys.size - (nullKeys ? 1 : 0), dupKeys, nullKeys };
}

async function reconcileFinance(sb, id, maxDate) {
  const now = new Date().toISOString();
  const { data: before } = await sb
    .from("commercial_entity_sync_state")
    .select("latest_data_date,status,last_error,retry_count")
    .eq("marketplace_account_id", id)
    .eq("entity", "finance")
    .maybeSingle();
  const { error } = await sb.from("commercial_entity_sync_state").upsert(
    {
      marketplace_account_id: Number(id),
      entity: "finance",
      status: "success",
      failure_class: null,
      last_error: null,
      last_execution_at: now,
      last_successful_execution_at: now,
      latest_data_date: maxDate,
      retry_count: 0,
      next_retry_at: null,
      updated_at: now,
    },
    { onConflict: "marketplace_account_id,entity" }
  );
  if (error) throw error;
  const { data: after } = await sb
    .from("commercial_entity_sync_state")
    .select("latest_data_date,status,last_error,retry_count")
    .eq("marketplace_account_id", id)
    .eq("entity", "finance")
    .maybeSingle();
  return { before, after };
}

async function main() {
  loadEnv();
  const doReconcile = process.argv.includes("--reconcile");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const out = { accounts: {} };
  for (const id of ["1", "2"]) {
    const fin = await financeMax(sb, id);
    const dup = await dups(sb, id);
    const { data: sales } = await sb
      .from("wb_sales")
      .select("sale_date")
      .eq("marketplace_account_id", id)
      .order("sale_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: orders } = await sb
      .from("wb_orders")
      .select("order_date")
      .eq("marketplace_account_id", id)
      .order("order_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: inv } = await sb
      .from("historical_inventory_snapshots")
      .select("snapshot_date")
      .eq("marketplace_account_id", id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: cc } = await sb
      .from("commercial_entity_sync_state")
      .select("entity,latest_data_date,status")
      .eq("marketplace_account_id", id);
    let reconcile = null;
    if (doReconcile && fin.max) {
      reconcile = await reconcileFinance(sb, id, fin.max);
    }
    out.accounts[id] = {
      finance: fin,
      dups: dup,
      salesMax: sales?.sale_date ? String(sales.sale_date).slice(0, 10) : null,
      ordersMax: orders?.order_date ? String(orders.order_date).slice(0, 10) : null,
      invMax: inv?.snapshot_date ? String(inv.snapshot_date).slice(0, 10) : null,
      cc,
      reconcile,
    };
  }
  const { error: incErr } = await sb
    .from("finance_incremental_sync_state")
    .select("marketplace_account_id")
    .limit(1);
  out.incrementalTable = incErr
    ? { exists: false, error: incErr.message }
    : { exists: true };
  out.reservation = process.env.ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE ?? null;
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
