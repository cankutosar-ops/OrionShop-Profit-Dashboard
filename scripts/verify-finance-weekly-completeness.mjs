#!/usr/bin/env node
/**
 * Phase 5/7 — weekly finance warehouse completeness, per marketplace account.
 *
 * Read-only. Reads Supabase (the source of truth), never Wildberries, and never
 * writes. Answers, week by week from 2026-01-01 to the last published week:
 *
 *   - is there any finance data at all?
 *   - is there revenue (for_pay), or is the week hollow?
 *   - which Reports/V1 fee components landed?
 *   - are there duplicate or null source_keys?
 *
 * A trailing week Wildberries has not published yet is reported PENDING and is
 * never counted as missing — forcing it to "complete" would be inventing data.
 *
 * IMPORTANT: every paginated read is ordered by a stable key. An earlier audit
 * reported thousands of phantom duplicates and several phantom missing weeks
 * purely because .range() was used without .order() — PostgREST is free to
 * return rows in a different order per page, so rows get skipped and repeated.
 *
 * Usage:
 *   npx tsx scripts/verify-finance-weekly-completeness.mjs
 *   npx tsx scripts/verify-finance-weekly-completeness.mjs --from 2026-01-01 --to 2026-09-09
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

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const FROM = argVal("from", "2026-01-01");
const TO = argVal("to", new Date().toISOString().slice(0, 10));

/**
 * WB publishes a weekly realisation report a few days after the week closes.
 * Weeks ending within this window are reported PENDING rather than MISSING.
 */
const PUBLICATION_LAG_DAYS = 5;

/**
 * Which accounts are audited for completeness.
 *
 * Uses the application's own `isOperationalMarketplaceAccount`, the same
 * predicate that decides whether an account appears in production scope
 * selectors, so this audit and the UI can never disagree about what is real.
 * It excludes "Verify Flow Test"-style tenants by name pattern.
 *
 * Deliberately NOT inferred from "has rows". An emptiness heuristic fails in the
 * one case that matters: a real account that lost its finance data would be
 * silently reclassified as not-onboarded and reported PASS. Classifying by
 * identity instead means an empty production account fails loudly.
 *
 * Accounts 3 and 4 are intentional empty test tenants, excluded from
 * completeness only — isolation and tenant-authorization tests still use them.
 *
 * ORION_PRODUCTION_ACCOUNT_IDS overrides the predicate when needed.
 */
const { isOperationalMarketplaceAccount } = await import(
  "../src/lib/marketplace-account-visibility.ts"
);

const ACCOUNT_ID_OVERRIDE = process.env.ORION_PRODUCTION_ACCOUNT_IDS
  ? new Set(
      process.env.ORION_PRODUCTION_ACCOUNT_IDS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : null;

function isProductionAccount(account) {
  if (ACCOUNT_ID_OVERRIDE) return ACCOUNT_ID_OVERRIDE.has(String(account.id));
  return isOperationalMarketplaceAccount({
    account_name: account.account_name ?? "",
    is_active: account.is_active ?? false,
  });
}

/** Reports/V1 components the user asked to account for, by source_key suffix. */
const EXPECTED_SUFFIXES = [
  "for_pay",
  "commission",
  "logistics",
  "return_logistics",
  "storage",
  "acceptance",
  "penalty",
  "deduction",
  "additional_payment",
  "acquiring_fee",
  "ppvz_vw",
  "ppvz_reward",
];

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/** ISO week (Monday-start) containing `date`. */
function isoWeekOf(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  const monday = new Date(d.getTime() - dow * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
    key: `${monday.toISOString().slice(0, 10)}:${sunday.toISOString().slice(0, 10)}`,
  };
}

function weeksBetween(from, to) {
  const out = [];
  let cursor = isoWeekOf(from);
  for (;;) {
    out.push(cursor);
    const next = new Date(Date.parse(`${cursor.from}T00:00:00Z`) + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (Date.parse(`${next}T00:00:00Z`) > Date.parse(`${to}T00:00:00Z`)) break;
    cursor = isoWeekOf(next);
  }
  return out;
}

/** Suffix of `rrd:{id}:{suffix}`, preferring the normalized column when present. */
function suffixOf(row) {
  if (row.wb_source_suffix && String(row.wb_source_suffix).trim()) {
    return String(row.wb_source_suffix).trim();
  }
  if (!row.source_key) return "";
  const parts = String(row.source_key).split(":");
  return parts[parts.length - 1] ?? "";
}

/** Paginated, stably ordered read of one account's finance rows. */
async function loadFinance(accountId) {
  const rows = [];
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("id, operation_date, amount, source_key, wb_source_suffix, rrd_id, rr_dt")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", FROM)
      .lte("operation_date", TO)
      .order("id", { ascending: true }) // stable — see header note
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`wb_finance read failed (account ${accountId}): ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

const todayMs = Date.parse(`${TO}T00:00:00Z`);
const report = { from: FROM, to: TO, generatedAt: new Date().toISOString(), accounts: {} };

const { data: accounts, error: accountsError } = await sb
  .from("marketplace_accounts")
  .select("id, account_name, is_active")
  .order("id");
if (accountsError) throw new Error(`cannot list accounts: ${accountsError.message}`);

for (const account of accounts) {
  const accountId = String(account.id);
  console.log(
    `\n=================== Account ${accountId} (${account.account_name}) ===================`
  );

  if (!isProductionAccount(account)) {
    const { count: strayRows } = await sb
      .from("wb_finance")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", accountId);
    console.log(
      `INFO  account ${accountId}: excluded — intentional empty test account ("${account.account_name}"); ` +
        `completeness not asserted, ${strayRows ?? 0} finance row(s) present`
    );
    report.accounts[accountId] = {
      accountName: account.account_name,
      classification: "test",
      excludedFromCompleteness: true,
      totalRows: strayRows ?? 0,
    };
    continue;
  }

  const rows = await loadFinance(accountId);

  // A production account with no finance data is a real failure, never a skip.
  check(
    `account ${accountId}: production account has finance data`,
    rows.length > 0,
    `${rows.length} row(s) in ${FROM}..${TO}`
  );
  if (rows.length === 0) {
    report.accounts[accountId] = {
      accountName: account.account_name,
      classification: "production",
      totalRows: 0,
    };
    continue;
  }

  // --- duplicate / null source_key (Phase 7 invariants) ---
  const keyCounts = new Map();
  let nullKeys = 0;
  for (const r of rows) {
    if (!r.source_key) {
      nullKeys += 1;
      continue;
    }
    keyCounts.set(r.source_key, (keyCounts.get(r.source_key) ?? 0) + 1);
  }
  const dupKeys = [...keyCounts.entries()].filter(([, n]) => n > 1);

  check(`account ${accountId}: no duplicate source_key`, dupKeys.length === 0, `${dupKeys.length} duplicated key(s) of ${keyCounts.size}`);
  check(`account ${accountId}: no null source_key`, nullKeys === 0, `${nullKeys} null of ${rows.length} row(s)`);

  // --- weekly buckets ---
  const byWeek = new Map();
  for (const r of rows) {
    const date = String(r.operation_date).slice(0, 10);
    const wk = isoWeekOf(date).key;
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(r);
  }

  const weeks = weeksBetween(FROM, TO);
  const weekReports = [];
  const missing = [];
  const hollow = [];
  const pending = [];

  for (const wk of weeks) {
    const wkRows = byWeek.get(wk.key) ?? [];
    const isPublished =
      Date.parse(`${wk.to}T00:00:00Z`) + PUBLICATION_LAG_DAYS * 86_400_000 <= todayMs;

    const bySuffix = {};
    for (const r of wkRows) {
      const s = suffixOf(r) || "(none)";
      if (!bySuffix[s]) bySuffix[s] = { n: 0, sum: 0 };
      bySuffix[s].n += 1;
      bySuffix[s].sum += Number(r.amount) || 0;
    }

    const forPay = bySuffix.for_pay?.sum ?? 0;
    const presentSuffixes = EXPECTED_SUFFIXES.filter((s) => bySuffix[s]);
    const absentSuffixes = EXPECTED_SUFFIXES.filter((s) => !bySuffix[s]);

    let status;
    if (!isPublished) status = wkRows.length > 0 ? "PENDING_PARTIAL" : "PENDING";
    else if (wkRows.length === 0) status = "MISSING";
    else if (!bySuffix.for_pay) status = "HOLLOW";
    else status = "OK";

    if (status === "MISSING") missing.push(wk.key);
    if (status === "HOLLOW") hollow.push(wk.key);
    if (status.startsWith("PENDING")) pending.push(wk.key);

    weekReports.push({
      week: wk.key,
      status,
      rows: wkRows.length,
      forPay: Math.round(forPay),
      presentSuffixes,
      absentSuffixes,
    });
  }

  console.log(
    `\n  week                       status           rows      for_pay   components`
  );
  for (const w of weekReports) {
    console.log(
      `  ${w.week}  ${w.status.padEnd(15)} ${String(w.rows).padStart(6)} ${String(
        w.forPay
      ).padStart(12)}   ${w.presentSuffixes.length}/${EXPECTED_SUFFIXES.length}` +
        (w.absentSuffixes.length && w.status === "OK"
          ? `  missing: ${w.absentSuffixes.join(",")}`
          : "")
    );
  }

  console.log("");
  check(
    `account ${accountId}: no published week is missing finance data`,
    missing.length === 0,
    missing.length ? missing.join(", ") : `${weeks.length - pending.length} published week(s)`
  );
  check(
    `account ${accountId}: no published week is hollow (rows but no for_pay)`,
    hollow.length === 0,
    hollow.length ? hollow.join(", ") : "all published weeks carry revenue"
  );

  // Normalization debt is reported, not failed: the engine resolves category
  // from the source_key suffix when the column is NULL, so P&L stays correct.
  const nullCategoryish = rows.filter((r) => r.rrd_id == null).length;
  if (nullCategoryish > 0) {
    console.log(
      `INFO  account ${accountId}: ${nullCategoryish}/${rows.length} row(s) have NULL rrd_id ` +
        `(legacy Statistics V5 writes; source_key still carries rrd:{id}:{suffix}, so categorisation is unaffected)`
    );
  }
  if (pending.length) {
    console.log(
      `INFO  account ${accountId}: ${pending.length} trailing week(s) not yet published by WB — ${pending.join(", ")}`
    );
  }

  report.accounts[accountId] = {
    accountName: account.account_name,
    classification: "production",
    totalRows: rows.length,
    duplicateSourceKeys: dupKeys.length,
    nullSourceKeys: nullKeys,
    nullRrdId: nullCategoryish,
    weeks: weekReports,
    missing,
    hollow,
    pending,
  };
}

console.log("\n=================== Audit scope ===================");
for (const account of accounts) {
  const accountId = String(account.id);
  const entry = report.accounts[accountId];
  if (entry?.classification === "production") {
    console.log(
      `  A${accountId}: audited — ${entry.totalRows} finance row(s), ` +
        `${entry.weeks ? entry.weeks.filter((w) => w.status === "OK").length : 0} week(s) OK`
    );
  } else {
    console.log(`  A${accountId}: excluded — intentional empty test account`);
  }
}

// Guard the classification itself: if it ever stops matching reality, the
// exclusions above would quietly hide a real account behind a green run.
const auditedIds = Object.entries(report.accounts)
  .filter(([, v]) => v.classification === "production")
  .map(([k]) => k)
  .sort();
const expectedIds = accounts.filter(isProductionAccount).map((a) => String(a.id)).sort();
check(
  "every operational account was audited",
  auditedIds.join(",") === expectedIds.join(","),
  `audited=[${auditedIds.join(",")}] operational=[${expectedIds.join(",")}]`
);
check(
  "at least one production account is being audited (audit is not vacuous)",
  auditedIds.length > 0,
  `${auditedIds.length} account(s)`
);

// An excluded account holding real data would mean the classification is wrong.
const nonEmptyExcluded = Object.entries(report.accounts).filter(
  ([, v]) => v.classification === "test" && (v.totalRows ?? 0) > 0
);
check(
  "no excluded test account contains finance data",
  nonEmptyExcluded.length === 0,
  nonEmptyExcluded.length
    ? nonEmptyExcluded.map(([k, v]) => `A${k}=${v.totalRows}`).join(", ")
    : "A3/A4 empty as expected"
);

mkdirSync(resolve("exports"), { recursive: true });
const outPath = resolve("exports/finance-weekly-completeness.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nArtifact: ${outPath}`);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exitCode = failures === 0 ? 0 : 1;
