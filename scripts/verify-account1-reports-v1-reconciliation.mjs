#!/usr/bin/env node
/**
 * Read-only reconciliation for the Account 1 → Reports/V1 migration.
 *
 * Compares what is actually persisted in wb_finance for Account 1 (legacy
 * Statistics V5 writes) against Account 2 (native Reports/V1), component by
 * component and week by week. The question it answers is not "do the two
 * accounts have the same numbers" — they are different businesses — but
 * "does A1's persisted shape already match what Reports/V1 produces", which is
 * what decides whether migration can upsert in place or would fork the data.
 *
 * Deliberately NOT asserted: Sales API forPay == Reports for_pay. That
 * discrepancy is expected and must not be "fixed".
 *
 * Writes nothing. Never calls Wildberries.
 *
 * Usage: npx tsx scripts/verify-account1-reports-v1-reconciliation.mjs
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SKIP  Supabase credentials absent — reconciliation needs read access");
  process.exit(0);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Every fee component the Reports/V1 mapper can emit, by source_key suffix. */
const COMPONENTS = [
  "for_pay",
  "commission",
  "logistics",
  "storage",
  "penalty",
  "return_logistics",
  "deduction",
  "acceptance",
  "acquiring_fee",
  "ppvz_reward",
  "additional_payment",
  "ppvz_vw",
];

const FROM = "2026-01-01";

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function utcMonday(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

async function loadAccount(accountId) {
  const rows = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("source_key, operation_date, rrd_id, wb_source_suffix, amount")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", FROM)
      .order("source_key", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`wb_finance a${accountId}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

console.log("=== Account 1 / Account 2 finance reconciliation (read-only) ===\n");

const accounts = { 1: await loadAccount("1"), 2: await loadAccount("2") };
const report = { generatedAt: new Date().toISOString(), accounts: {} };

for (const [accountId, rows] of Object.entries(accounts)) {
  console.log(`\n--------------- Account ${accountId} ---------------`);

  // --- row count + source_key uniqueness ---
  const keys = rows.map((r) => r.source_key);
  const unique = new Set(keys);
  check(
    `A${accountId}: source_key is unique within the account`,
    unique.size === keys.length,
    `${keys.length} row(s), ${unique.size} distinct key(s)`
  );
  check(
    `A${accountId}: no null source_key`,
    rows.every((r) => r.source_key),
    `${rows.filter((r) => !r.source_key).length} null`
  );

  // --- source_key shape must be the Reports/V1 shape ---
  const badShape = rows.filter((r) => !/^rrd:\d+:.+$/.test(String(r.source_key ?? "")));
  check(
    `A${accountId}: every source_key uses the Reports/V1 shape rrd:<id>:<suffix>`,
    badShape.length === 0,
    badShape.length
      ? `${badShape.length} off-shape, e.g. ${badShape[0].source_key}`
      : "100% rrd:<number>:<suffix>"
  );

  // --- the rrd embedded in the key must agree with the column when present ---
  let mismatch = 0;
  let nullCol = 0;
  for (const r of rows) {
    const m = String(r.source_key ?? "").match(/^rrd:(\d+):/);
    if (!m) continue;
    if (r.rrd_id == null) nullCol += 1;
    else if (Number(r.rrd_id) !== Number(m[1])) mismatch += 1;
  }
  check(
    `A${accountId}: rrd_id column never contradicts the key`,
    mismatch === 0,
    `${mismatch} contradiction(s); ${nullCol} row(s) have a NULL column but a valid key`
  );

  // --- component coverage ---
  const bySuffix = new Map();
  for (const r of rows) {
    const m = String(r.source_key ?? "").match(/^rrd:\d+:(.+)$/);
    const suffix = r.wb_source_suffix ?? (m ? m[1] : "?");
    bySuffix.set(suffix, (bySuffix.get(suffix) ?? 0) + 1);
  }
  console.log(`  components present:`);
  for (const c of COMPONENTS) {
    const n = bySuffix.get(c) ?? 0;
    console.log(`    ${c.padEnd(20)} ${String(n).padStart(7)}`);
  }
  const extra = [...bySuffix.keys()].filter((s) => !COMPONENTS.includes(s));
  if (extra.length) {
    console.log(`    (other suffixes: ${extra.map((s) => `${s}=${bySuffix.get(s)}`).join(", ")})`);
  }

  // --- weekly coverage ---
  const weeks = new Map();
  for (const r of rows) {
    const wk = utcMonday(String(r.operation_date).slice(0, 10));
    if (!weeks.has(wk)) weeks.set(wk, { rows: 0, forPay: 0 });
    const w = weeks.get(wk);
    w.rows += 1;
    const m = String(r.source_key ?? "").match(/^rrd:\d+:(.+)$/);
    if ((r.wb_source_suffix ?? (m ? m[1] : "")) === "for_pay") w.forPay += 1;
  }
  const weekKeys = [...weeks.keys()].sort();
  const hollow = weekKeys.filter((w) => weeks.get(w).forPay === 0);
  check(
    `A${accountId}: no week carries rows without revenue`,
    hollow.length === 0,
    hollow.length ? hollow.join(", ") : `${weekKeys.length} week(s) all carry for_pay`
  );

  // contiguity: no gap between the first and last week that has data
  const gaps = [];
  for (let w = weekKeys[0]; w && w < weekKeys[weekKeys.length - 1]; w = addDays(w, 7)) {
    if (!weeks.has(w)) gaps.push(w);
  }
  check(
    `A${accountId}: weekly coverage is contiguous`,
    gaps.length === 0,
    gaps.length ? `${gaps.length} missing: ${gaps.slice(0, 5).join(", ")}` : `${weekKeys[0]} .. ${weekKeys[weekKeys.length - 1]}`
  );

  report.accounts[accountId] = {
    rows: rows.length,
    distinctSourceKeys: unique.size,
    offShapeKeys: badShape.length,
    rrdColumnNull: nullCol,
    rrdColumnMismatch: mismatch,
    components: Object.fromEntries(COMPONENTS.map((c) => [c, bySuffix.get(c) ?? 0])),
    weeks: weekKeys.length,
    firstWeek: weekKeys[0] ?? null,
    lastWeek: weekKeys[weekKeys.length - 1] ?? null,
    hollowWeeks: hollow,
    weekGaps: gaps,
  };
}

// --- cross-account isolation ---
console.log(`\n--------------- Isolation ---------------`);
const a1Keys = new Set(accounts[1].map((r) => r.source_key));
const shared = accounts[2].filter((r) => a1Keys.has(r.source_key)).map((r) => r.source_key);
check(
  "no source_key is shared between Account 1 and Account 2",
  shared.length === 0,
  shared.length ? `${shared.length} shared, e.g. ${shared[0]}` : "disjoint key spaces"
);
console.log(
  "  note: source_key carries no account component, so disjointness here is\n" +
    "  observational. The guarantee comes from the unique index on\n" +
    "  (marketplace_account_id, source_key), which keeps identical rrd ids apart."
);

// --- does A1's persisted shape match what V1 will write? ---
console.log(`\n--------------- Migration compatibility ---------------`);
const a1 = report.accounts[1];
check(
  "A1 keys are already V1-shaped, so a V1 re-fetch UPDATES rather than duplicates",
  a1.offShapeKeys === 0 && a1.rrdColumnMismatch === 0,
  `${a1.offShapeKeys} off-shape, ${a1.rrdColumnMismatch} contradictions`
);
const a1Missing = COMPONENTS.filter((c) => (a1.components[c] ?? 0) === 0);
const a2Missing = COMPONENTS.filter((c) => (report.accounts[2].components[c] ?? 0) === 0);
console.log(
  `  components absent for A1: ${a1Missing.length ? a1Missing.join(", ") : "none"}`
);
console.log(
  `  components absent for A2: ${a2Missing.length ? a2Missing.join(", ") : "none"}`
);
console.log(
  "  A component absent in only one account is normal — not every seller incurs\n" +
    "  every fee. It is only a defect if it is absent in a week where the report\n" +
    "  contains it, which weekly completeness already covers."
);

// --- Account 2 incremental state must be untouched by the A1 migration ---
const { data: states } = await sb
  .from("finance_incremental_sync_state")
  .select("marketplace_account_id, mode, week_status, completed_weeks, latest_successful_data_date");
const byAccount = Object.fromEntries(
  (states ?? []).map((s) => [String(s.marketplace_account_id), s])
);
check(
  "Account 2 still has its own incremental state",
  Boolean(byAccount["2"]),
  byAccount["2"]
    ? `mode=${byAccount["2"].mode} weekStatus=${byAccount["2"].week_status} weeks=${Object.keys(byAccount["2"].completed_weeks ?? {}).length}`
    : "missing"
);
check(
  "Account 1 now has a seeded anchor",
  Boolean(byAccount["1"]) && Object.keys(byAccount["1"]?.completed_weeks ?? {}).length > 0,
  byAccount["1"]
    ? `anchor=${Object.keys(byAccount["1"].completed_weeks ?? {}).join(",")}`
    : "missing"
);
check(
  "no state row exists for a non-migrated account",
  !(states ?? []).some((s) => !["1", "2"].includes(String(s.marketplace_account_id))),
  `${(states ?? []).length} state row(s) total`
);

report.states = byAccount;
mkdirSync(resolve("exports"), { recursive: true });
const out = resolve("exports/account1-reports-v1-reconciliation.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nArtifact: ${out}`);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
