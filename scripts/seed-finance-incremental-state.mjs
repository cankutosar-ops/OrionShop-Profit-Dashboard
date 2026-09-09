#!/usr/bin/env node
/**
 * Seed the Reports/V1 incremental anchor for ONE marketplace account.
 *
 * The Reports/V1 planner picks work by taking the latest entry in
 * `completed_weeks` and moving to the next sequential 7-day period. With no
 * entry it returns `awaiting_completed_weeks_anchor` and the account ingests
 * nothing. Seeding that anchor is therefore the whole migration switch, and
 * getting it wrong either re-imports history or skips weeks.
 *
 * So the anchor is DERIVED from persisted finance data, never passed in blind:
 * it is the last fully-covered Mon–Sun week in `wb_finance` for this account.
 * The next period the planner picks is the first week after it — exactly the
 * frontier where legacy ingestion stopped.
 *
 * Dry-run by default. Writes only with --apply, only the named account's row,
 * and refuses to overwrite an existing row unless --force.
 *
 * Usage:
 *   npx tsx scripts/seed-finance-incremental-state.mjs --account 1
 *   npx tsx scripts/seed-finance-incremental-state.mjs --account 1 --apply
 */

import { readFileSync } from "node:fs";
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

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const ACCOUNT_ID = String(argVal("account", "")).trim();
const APPLY = has("apply");
const FORCE = has("force");

if (!/^[1-9]\d*$/.test(ACCOUNT_ID)) {
  console.error("FAIL  --account must be a positive integer marketplace account id");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "FAIL  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
  );
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

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

console.log(`=== Reports/V1 anchor seed — account ${ACCOUNT_ID} ===`);
console.log(APPLY ? "mode: APPLY (will write)" : "mode: DRY RUN (no write)\n");

// --- account must exist ---
const { data: account, error: accErr } = await sb
  .from("marketplace_accounts")
  .select("id, account_name, is_active")
  .eq("id", ACCOUNT_ID)
  .maybeSingle();
if (accErr) {
  console.error(`FAIL  marketplace_accounts read: ${accErr.message}`);
  process.exit(1);
}
if (!account) {
  console.error(`FAIL  no marketplace account with id=${ACCOUNT_ID}`);
  process.exit(1);
}
console.log(`account: ${account.account_name} (active=${account.is_active})`);

// --- refuse to clobber an existing anchor ---
const { data: existing, error: exErr } = await sb
  .from("finance_incremental_sync_state")
  .select("*")
  .eq("marketplace_account_id", ACCOUNT_ID)
  .maybeSingle();
if (exErr) {
  console.error(`FAIL  state read: ${exErr.message}`);
  process.exit(1);
}
if (existing && !FORCE) {
  const weeks = Object.keys(existing.completed_weeks ?? {}).sort();
  console.error(
    `\nFAIL  account ${ACCOUNT_ID} already has an incremental state row ` +
      `(mode=${existing.mode}, weekStatus=${existing.week_status}, ` +
      `${weeks.length} completed week(s), latest=${weeks[weeks.length - 1] ?? "none"}).\n` +
      `      Overwriting it could rewind or skip the cursor. Pass --force only if that is intended.`
  );
  process.exit(1);
}

// --- derive the anchor from persisted finance data ---
console.log(`\nDeriving anchor from wb_finance rows for account ${ACCOUNT_ID}...`);
const dates = [];
const PAGE = 1000;
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", ACCOUNT_ID)
    .order("operation_date", { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) {
    console.error(`FAIL  wb_finance read: ${error.message}`);
    process.exit(1);
  }
  if (!data?.length) break;
  for (const r of data) dates.push(String(r.operation_date).slice(0, 10));
  if (data.length < PAGE) break;
}

if (dates.length === 0) {
  console.error(
    `\nFAIL  account ${ACCOUNT_ID} has no wb_finance rows, so there is no frontier to anchor to.\n` +
      `      Seeding an invented anchor would either skip history or re-import it. ` +
      `Run historical ingestion first.`
  );
  process.exit(1);
}

const weekRows = new Map();
for (const d of dates) {
  const wk = utcMonday(d);
  weekRows.set(wk, (weekRows.get(wk) ?? 0) + 1);
}
const weekStarts = [...weekRows.keys()].sort();
const anchorFrom = weekStarts[weekStarts.length - 1];
const anchorTo = addDays(anchorFrom, 6);
const anchorKey = `${anchorFrom}:${anchorTo}`;
const maxDate = dates[dates.length - 1];
const nextFrom = addDays(anchorTo, 1);
const nextTo = addDays(nextFrom, 6);

console.log(`  finance rows            : ${dates.length}`);
console.log(`  coverage                : ${dates[0]} .. ${maxDate}`);
console.log(`  weeks with data         : ${weekStarts.length}`);
console.log(`  last week with data     : ${anchorKey} (${weekRows.get(anchorFrom)} rows)`);

// The anchor must be a week the account actually finished. If the newest data
// stops mid-week, that week is still in flight and anchoring past it would skip
// the remainder.
if (maxDate !== anchorTo) {
  console.error(
    `\nFAIL  the newest finance row is ${maxDate}, but the last week runs to ${anchorTo}.\n` +
      `      That week looks partially ingested, so anchoring on it would skip ${maxDate}..${anchorTo}.\n` +
      `      Resolve the partial week before seeding.`
  );
  process.exit(1);
}

console.log(`\n  ANCHOR (completed week) : ${anchorKey}`);
console.log(`  first period V1 fetches : ${nextFrom}:${nextTo}`);
console.log(
  `  reason                  : last fully-covered week; the next sequential period is\n` +
    `                            the exact frontier where legacy ingestion stopped, so\n` +
    `                            nothing is re-imported and nothing is skipped.`
);

const nowIso = new Date().toISOString();
const row = {
  marketplace_account_id: ACCOUNT_ID,
  mode: "idle",
  week_status: "idle",
  active_week_from: null,
  active_week_to: null,
  last_persisted_rrd_id: 0,
  overlap_revalidate_queue: [],
  completed_weeks: {
    [anchorKey]: {
      from: anchorFrom,
      to: anchorTo,
      completedAt: nowIso,
      lastRevalidatedAt: null,
    },
  },
  reports_last_request_at: null,
  reports_next_request_not_before: null,
  reports_server_retry_until: null,
  reports_last_rate_limit_snapshot: null,
  lock_owner: null,
  lock_heartbeat_at: null,
  lock_started_at: null,
  latest_successful_data_date: anchorTo,
  last_http_status: null,
  last_wake_at: null,
  last_error: null,
  last_cursor_before: null,
  last_cursor_after: null,
  last_rows_received: null,
  last_rows_persisted: null,
  last_has_more: null,
  updated_at: nowIso,
};

console.log(`\n--- row to write ---`);
console.log(JSON.stringify(row, null, 2));

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to seed.`);
  process.exit(0);
}

const { error: wErr } = await sb
  .from("finance_incremental_sync_state")
  .upsert(row, { onConflict: "marketplace_account_id" });
if (wErr) {
  console.error(`FAIL  state write: ${wErr.message}`);
  process.exit(1);
}

// --- read back and prove the planner will now choose the intended period ---
const { data: readBack, error: rbErr } = await sb
  .from("finance_incremental_sync_state")
  .select("*")
  .eq("marketplace_account_id", ACCOUNT_ID)
  .maybeSingle();
if (rbErr || !readBack) {
  console.error(`FAIL  read-back: ${rbErr?.message ?? "no row"}`);
  process.exit(1);
}
const rbWeeks = Object.keys(readBack.completed_weeks ?? {});
const ok =
  String(readBack.marketplace_account_id) === ACCOUNT_ID &&
  rbWeeks.length === 1 &&
  rbWeeks[0] === anchorKey &&
  readBack.week_status === "idle" &&
  Number(readBack.last_persisted_rrd_id) === 0;

console.log(`\nread-back: account=${readBack.marketplace_account_id} ` +
  `weeks=[${rbWeeks.join(", ")}] weekStatus=${readBack.week_status} ` +
  `rrdId=${readBack.last_persisted_rrd_id}`);

// no other account's state was touched
const { count: totalStates } = await sb
  .from("finance_incremental_sync_state")
  .select("marketplace_account_id", { count: "exact", head: true });
console.log(`total state rows in table: ${totalStates}`);

console.log(ok ? `\nPASS  account ${ACCOUNT_ID} anchored at ${anchorKey}` : `\nFAIL  read-back mismatch`);
process.exit(ok ? 0 : 1);
