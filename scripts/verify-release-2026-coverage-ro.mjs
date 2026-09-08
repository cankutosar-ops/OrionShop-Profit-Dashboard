/**
 * READ-ONLY 2026 warehouse coverage for Account 1 and Account 2.
 * No WB HTTP. No writes.
 * Run: npx tsx scripts/verify-release-2026-coverage-ro.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = resolve(f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const FROM = "2026-01-01";
const TO = new Date().toISOString().slice(0, 10);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function d10(v) {
  return String(v || "").slice(0, 10);
}

async function countEq(table, accountId) {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId);
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function financeSpan(accountId) {
  const { data: minRow, error: e1 } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  const { data: maxRow, error: e2 } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e2) throw e2;
  return { min: d10(minRow?.operation_date), max: d10(maxRow?.operation_date) };
}

async function suffixStats(accountId, suffix) {
  let n = 0;
  let sum = 0;
  let i = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("amount")
      .eq("marketplace_account_id", accountId)
      .eq("wb_source_suffix", suffix)
      .gte("operation_date", FROM)
      .lte("operation_date", `${TO}T23:59:59`)
      .range(i, i + 999);
    if (error) throw error;
    const rows = data || [];
    n += rows.length;
    for (const r of rows) sum += Number(r.amount) || 0;
    if (rows.length < 1000) break;
    i += 1000;
  }
  return { n, sum: Math.round(sum * 100) / 100 };
}

async function nullSourceKeys(accountId) {
  const { count, error } = await sb
    .from("wb_finance")
    .select("id", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .is("source_key", null);
  if (error) throw error;
  return count ?? 0;
}

async function adsCount() {
  const { count, error } = await sb.from("wb_ads").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function incrementalState(accountId) {
  const { data, error } = await sb
    .from("finance_incremental_sync_state")
    .select(
      "marketplace_account_id,mode,week_status,active_week_from,active_week_to,last_persisted_rrd_id,lock_owner,lock_heartbeat_at,reports_next_request_not_before,completed_weeks"
    )
    .eq("marketplace_account_id", accountId)
    .maybeSingle();
  if (error) return { error: error.message };
  return data;
}

const SUFFIXES = [
  "for_pay",
  "logistics",
  "return_logistics",
  "storage",
  "acceptance",
  "penalty",
  "deduction",
  "additional_payment",
  "acquiring_fee",
  "commission",
];

const report = {
  generatedAt: new Date().toISOString(),
  period: { from: FROM, to: TO },
  accounts: {},
  adsGlobal: await adsCount(),
};

for (const id of ["1", "2"]) {
  const [financeRows, salesRows, ordersRows, span, nullKeys, state] = await Promise.all([
    countEq("wb_finance", id),
    countEq("wb_sales", id),
    countEq("wb_orders", id),
    financeSpan(id),
    nullSourceKeys(id),
    incrementalState(id),
  ]);
  const suffixes = {};
  for (const s of SUFFIXES) {
    suffixes[s] = await suffixStats(id, s);
  }
  const completedWeeks =
    state && typeof state === "object" && state.completed_weeks
      ? Object.keys(state.completed_weeks).length
      : 0;
  report.accounts[id] = {
    financeRows,
    salesRows,
    ordersRows,
    span,
    nullSourceKeys: nullKeys,
    suffixes,
    incremental: state,
    completedWeekCount: completedWeeks,
  };
  console.log(`\n=== Account ${id} ===`);
  console.log(`finance=${financeRows} sales=${salesRows} orders=${ordersRows}`);
  console.log(`span=${span.min} → ${span.max}`);
  console.log(`null source_key=${nullKeys}`);
  console.log(
    `for_pay n=${suffixes.for_pay.n} amt=${suffixes.for_pay.sum} logistics n=${suffixes.logistics.n} amt=${suffixes.logistics.sum}`
  );
  console.log(
    `incremental mode=${state?.mode ?? "missing"} week=${state?.week_status ?? "n/a"} completed_weeks=${completedWeekCountOrErr(
      state,
      completedWeeks
    )}`
  );
}

function completedWeekCountOrErr(state, n) {
  if (state?.error) return state.error;
  return n;
}

console.log(`\nwb_ads global rows=${report.adsGlobal}`);
const outDir = resolve("exports");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "_release-2026-coverage-ro.json"), JSON.stringify(report, null, 2));
console.log("wrote exports/_release-2026-coverage-ro.json");
