#!/usr/bin/env node
/**
 * Read-only freshness audit + recovery for active production accounts.
 * Target as-of: 2026-08-27
 */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const TARGET = "2026-08-27";
const RECOVER = process.argv.includes("--recover");
const ACCOUNT_FILTER = process.argv.find((a) => /^\d+$/.test(a));

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { filterOperationalMarketplaceAccounts } = await import(
  "../src/lib/marketplace-account-visibility.ts"
);
const { FRESHNESS_WARN_DAYS, FRESHNESS_CRITICAL_DAYS } = await import(
  "../src/lib/production-health/score.ts"
);
const { daysBetweenIso, resolveCommercialSyncWindow } = await import(
  "../src/lib/commercial-continuity/window.ts"
);
const { readLatestDataDateFromDb } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);

const sb = createAdminClient();

async function latestStock(accountId) {
  const { data } = await sb
    .from("wb_stock")
    .select("last_synced_at")
    .eq("marketplace_account_id", accountId)
    .order("last_synced_at", { ascending: false })
    .limit(1);
  return data?.[0]?.last_synced_at ? String(data[0].last_synced_at).slice(0, 10) : null;
}

function classify(entity, daysBehind) {
  if (daysBehind == null) return "unknown";
  if (daysBehind > FRESHNESS_CRITICAL_DAYS[entity]) return "critical";
  if (daysBehind > FRESHNESS_WARN_DAYS[entity]) return "delayed";
  return "current";
}

const { data: accountsRaw, error } = await sb
  .from("marketplace_accounts")
  .select(
    "id,account_name,is_active,sync_enabled,last_sync_at,last_successful_sync_at,last_sync_status"
  )
  .eq("is_active", true)
  .order("id");

if (error) throw new Error(error.message);

let accounts = filterOperationalMarketplaceAccounts(
  (accountsRaw ?? []).map((a) => ({
    ...a,
    id: String(a.id),
  }))
).filter((a) => a.sync_enabled !== false);

if (ACCOUNT_FILTER) accounts = accounts.filter((a) => a.id === ACCOUNT_FILTER);

console.log(`=== Data Freshness Audit (as-of ${TARGET}) ===\n`);
console.log(`Accounts: ${accounts.length}`);
console.log(`Mode: ${RECOVER ? "AUDIT + RECOVER" : "AUDIT ONLY"}\n`);

const auditRows = [];

for (const acc of accounts) {
  const row = {
    id: acc.id,
    name: acc.account_name,
    last_sync_at: acc.last_sync_at,
    last_sync_status: acc.last_sync_status,
    entities: {},
  };

  for (const entity of ["orders", "sales", "finance"]) {
    const latest = await readLatestDataDateFromDb(acc.id, entity);
    const lag = daysBetweenIso(latest, TARGET);
    row.entities[entity] = {
      latest_data_date: latest,
      days_behind: lag,
      status: classify(entity, lag),
    };
  }

  row.entities.stock = {
    latest_data_date: await latestStock(acc.id),
    days_behind: daysBetweenIso(await latestStock(acc.id), TARGET),
    status: "info",
  };

  auditRows.push(row);

  console.log(`Account ${acc.id} — ${acc.account_name}`);
  console.log(`  last_sync_at: ${acc.last_sync_at ?? "never"} (${acc.last_sync_status ?? "—"})`);
  for (const [e, v] of Object.entries(row.entities)) {
    console.log(
      `  ${e}: latest=${v.latest_data_date ?? "(none)"} lag=${v.days_behind ?? "?"}d [${v.status}]`
    );
  }
  console.log("");
}

if (!RECOVER) {
  console.log("Run with --recover to sync orders,sales,finance for stale accounts.");
  process.exit(0);
}

const { runBlockingDashboardSync } = await import("../src/services/sync-job-service.ts");

console.log("=== RECOVERY (orders + sales + finance via existing sync) ===\n");

for (const row of auditRows) {
  const needsRecovery = ["orders", "sales", "finance"].some(
    (e) => (row.entities[e].days_behind ?? 999) > 0
  );
  if (!needsRecovery) {
    console.log(`Account ${row.id}: skip (commercial entities current)`);
    continue;
  }

  const lags = ["orders", "sales", "finance"].map(
    (e) => row.entities[e].days_behind ?? 0
  );
  const maxLag = Math.max(...lags, 0);
  const maxLookbackDays = Math.min(90, Math.max(30, maxLag + 3));

  const latestDates = ["orders", "sales", "finance"]
    .map((e) => row.entities[e].latest_data_date)
    .filter(Boolean);
  const minLatest =
    latestDates.length > 0
      ? latestDates.sort()[0]
      : null;

  const window = resolveCommercialSyncWindow({
    latestDataDate: minLatest,
    maxLookbackDays,
    now: new Date(`${TARGET}T12:00:00.000Z`),
  });

  console.log(
    `Account ${row.id}: syncing ${window.dateFrom} → ${window.dateTo} (lookback=${maxLookbackDays}d, entities: orders,sales,finance)`
  );

  try {
    const result = await runBlockingDashboardSync({
      marketplaceAccountId: row.id,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      entities: ["orders", "sales", "finance"],
      trigger: "recover",
    });

    console.log(`  status=${result.lastSyncStatus} success=${result.success}`);
    for (const r of result.results) {
      const err = r.errors?.find((x) => !String(x).startsWith("warning:"));
      console.log(
        `  ${r.entity}: processed=${r.recordsProcessed} ins=${r.recordsInserted} upd=${r.recordsUpdated}${err ? ` ERR=${String(err).slice(0, 120)}` : ""}`
      );
    }
  } catch (e) {
    console.log(`  FAILED: ${e instanceof Error ? e.message : e}`);
  }
  console.log("");
}

console.log("=== POST-RECOVERY AUDIT ===\n");

for (const acc of accounts) {
  console.log(`Account ${acc.id} — ${acc.account_name}`);
  for (const entity of ["orders", "sales", "finance"]) {
    const latest = await readLatestDataDateFromDb(acc.id, entity);
    const lag = daysBetweenIso(latest, TARGET);
    console.log(
      `  ${entity}: latest=${latest ?? "(none)"} lag=${lag ?? "?"}d [${classify(entity, lag)}]`
    );
  }
  const { data: meta } = await sb
    .from("marketplace_accounts")
    .select("last_sync_at,last_sync_status")
    .eq("id", acc.id)
    .single();
  console.log(
    `  sync_meta: last_sync_at=${meta?.last_sync_at} status=${meta?.last_sync_status}\n`
  );
}
